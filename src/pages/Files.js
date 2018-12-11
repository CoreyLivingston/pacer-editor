import React, {Component, Fragment} from 'react';
import {produce} from "immer";
import {isSysexData, mergeDeep, parseSysexDump, requestAllPresets} from "../pacer/sysex";
import Midi from "../components/Midi";
import {ANY_MIDI_PORT, PACER_MIDI_PORT_NAME, SYSEX_SIGNATURE, TARGET_PRESET} from "../pacer/constants";
import PortsGrid from "../components/PortsGrid";
import DumpSysex from "../components/DumpSysex";
import Download from "../components/Download";
import {outputById, outputName} from "../utils/ports";
import {presetIndexToXY} from "../pacer/utils";
import Dropzone from "react-dropzone";


function batchMessages(callback, wait) {

    let messages = [];  // batch of received messages
    let timeout;

    return function() {
        clearTimeout(timeout);
        let event = arguments[0];
        messages.push(event.data);
        timeout = setTimeout(() => {
            // console.log("timeout elapsed");
            timeout = null;
            callback(messages);
            messages = [];
        }, wait);
    };
}


const Preset = ({ index, data }) => {
    if (data === null || data === undefined) return null;
    return (
        <div>
            Preset {presetIndexToXY(parseInt(index, 10))} (#{index}): {data["name"]}
        </div>
    );
};

const Presets = ({ presets }) => {
    if (presets === null || presets === undefined) return null;
    return (
        <div>
            {Object.keys(presets).map(idx => <Preset key={idx} index={idx} data={presets[idx]} />)}
        </div>
    );
};

const DumpContent = ({ data }) => {
    return (
        <div className="">
        {
            data && <Presets presets={data[TARGET_PRESET]} />
        }
        </div>
    );
};


const MAX_FILE_SIZE = 5 * 1024*1024;


class Files extends Component {

    state = {
        output: null,   // MIDI output port used for output
        data: null,     // json
        binData: null,  // binary, will be used to download as .syx file
        dropZoneActive: false
    };

    /**
     * Ad-hoc method to show the busy flag and set a timeout to make sure the busy flag is hidden after a timeout.
     */
    showBusy = () =>  {
        setTimeout(() => this.props.onBusy(false), 20000);
        this.props.onBusy(true);
    };

/*
    handleMidiInputEvent = batchMessages(
        messages => {
            this.setState(
                produce(
                    draft => {
                        for (let m of messages) {
                            if (isSysexData(m)) {
                                draft.data = mergeDeep(draft.data || {}, parseSysexDump(m));
                            } else {
                                console.log("MIDI message is not a sysex message")
                            }
                        }
                    }
                )
            );
            // let bytes = messages.reduce((accumulator, element) => accumulator + element.length, 0);
            // this.addInfoMessage(`${messages.length} messages received (${bytes} bytes)`);
            this.props.onBusy(false);
        },
        1000
    );
*/

    handleMidiInputEvent = batchMessages(
        messages => {

            let bytes = messages.reduce((accumulator, element) => accumulator + element.length, 0);

            this.setState(
                produce(
                    draft => {

                        draft.binData = new Uint8Array(bytes);
                        let bin_index = 0;

                        for (let m of messages) {

                            draft.binData.set(m, bin_index);
                            bin_index += m.length;

                            if (isSysexData(m)) {
                                draft.data = mergeDeep(draft.data || {}, parseSysexDump(m));
                            } else {
                                console.log("MIDI message is not a sysex message")
                            }
                        }
                    }
                )
            );

            // this.addInfoMessage(`${messages.length} messages received (${bytes} bytes)`);
            this.props.onBusy(false);
        },
        1000
    );

    /**
     *
     * @param files
     * @returns {Promise<void>}
     */
    async readFiles(files) {
        await Promise.all(files.map(
            async file => {
                if (file.size > MAX_FILE_SIZE) {
                    console.warn(`${file.name}: file too big, ${file.size}`);
                } else {
                    this.showBusy();
                    const data = new Uint8Array(await new Response(file).arrayBuffer());
                    if (isSysexData(data)) {
                        this.setState(
                            produce(draft => {
                                draft.binData = data;
                                draft.data = mergeDeep(draft.data || {}, parseSysexDump(data));
                                this.props.onBusy(false);
                            })
                        );
                        // this.addInfoMessage("sysfile decoded");
                        // } else {
                        //     console.log("readFiles: not a sysfile", hs(data.slice(0, 5)));
                    }
                    this.props.onBusy(false);
                    // non sysex files are ignored
                }
                // too big files are ignored
            }
        ));
    }

    onDragEnter = () => {
        this.setState({
            dropZoneActive: true
        });
    };

    onDragLeave= () => {
        this.setState({
            dropZoneActive: false
        });
    };

    /**
     * Drop Zone handler
     * @param files
     */
    onDrop = (files) => {
        console.log('drop', files);
        this.setState(
            {
                data: null,
                changed: false,
                dropZoneActive: false
            },
            () => {this.readFiles(files)}   // returned promise from readFiles() is ignored, this is normal.
        );
    };

    onOutputConnection = (port_id) => {
        this.setState(
            produce(draft => {
                draft.output = port_id;
            })
        );
        // this.addInfoMessage(`output ${outputName(port_id)} connected`);
    };

    sendSysex = msg => {
        console.log("sendSysex", msg);
        if (!this.state.output) return;
        let out = outputById(this.state.output);
        if (!out) {
            console.warn(`send: output ${this.state.output} not found`);
            return;
        }
        this.showBusy();
        this.setState(
            {data: null},
            () => out.sendSysex(SYSEX_SIGNATURE, msg)
        );
    };

    sendMessage = (msg) => {
        this.sendSysex(msg);
    };

    /**
     * @returns {*}
     */
    render() {

        const { data, output } = this.state;

        // console.log("Files.render", this.props);

        console.log("Files.render", data);

        const { /*accept, files,*/ dropZoneActive } = this.state;

        const overlayStyle = {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            paddingTop: '4rem',
            background: 'rgba(0,0,0,0.4)',
            textAlign: 'center',
            color: '#fff',
            fontSize: '4rem'
        };

        return (

            <Dropzone
                disableClick
                style={{position: "relative"}}
                // accept={accept}
                onDrop={this.onDrop}
                onDragEnter={this.onDragEnter}
                onDragLeave={this.onDragLeave}>
                {dropZoneActive &&
                <div style={overlayStyle}>
                    Drop sysex file...
                </div>}

                <div className="wrapper">

                    <div className="subheader">
                        <Midi only={ANY_MIDI_PORT} autoConnect={PACER_MIDI_PORT_NAME}
                              portsRenderer={(groupedPorts, clickHandler) => <PortsGrid groupedPorts={groupedPorts} clickHandler={clickHandler} />}
                              onMidiInputEvent={this.handleMidiInputEvent}
                              onOutputConnection={this.onOutputConnection}
                              className="" >
                            <div className="no-midi">Please connect your Pacer to your computer.</div>
                        </Midi>

    {/*
                        <div className="download-upload">
                            {data &&
                            <Download data={this.state.binData} filename={`pacer-preset-${presetIndexToXY(presetIndex)}`} addTimestamp={true}
                                      label="Download the preset as a binary sysex file" />
                            }
                            <input ref={this.inputOpenFileRef} type="file" style={{display:"none"}}  onChange={this.onChangeFile} />
                            <button onClick={this.onInputFile}>Load preset from a binary sysex file</button>
                        </div>
    */}

                    </div>

                    <div className="content">
                        <div className="content-row-content">
                            <div className="content-row-content-content">
                                {!output &&
                                <div className="instructions space-below">
                                    You can drag & drop a sysex file here.
                                </div>
                                }
                                {output &&
                                <Fragment>
                                    <div className="instructions space-below">
                                        Click the button below to request a full dump from the Pacer. You can also drag & drop a sysex file here.
                                    </div>
                                    <div className="actions">
                                        <button className="update" onClick={() => this.sendMessage(requestAllPresets())}>Get full dump from Pacer</button>
                                    </div>
                                </Fragment>
                                }
                            </div>
                        </div>

                        {data &&
                        <div className="content-row-content">
                            <div className="content-row-content-content">
                                <div className="message code">
                                    <DumpContent data={data} />
                                </div>
                            </div>
                        </div>}

                    </div>

                </div>

            </Dropzone>
        );
    }
}

export default Files;