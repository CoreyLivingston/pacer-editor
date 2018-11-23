import React, {Component} from 'react';
import {
    checksum,
    isSysexData,
    mergeDeep,
    parseSysexDump,
    requestAllPresets,
    requestPreset,
    requestPresetObj
} from "../pacer/sysex";
import {ANY_MIDI_PORT, SYSEX_SIGNATURE} from "../pacer/constants";
import {outputById} from "../utils/ports";
import {fromHexString, h, hs} from "../utils/hexstring";
import "./TestSender.css";
import {produce} from "immer";
import DumpSysex from "../components/DumpSysex";
import {PACER_MIDI_PORT_NAME, SYSEX_HEADER} from "../pacer/constants";
import Midi from "../components/Midi";
import PortsGrid from "../components/PortsGrid";


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

class TestSender extends Component {

    state = {
        output: null,           // MIDI output port used for output
        data: null,
        messages: [{
            name: "read current preset",
            message: requestPreset(0)
        }, {
            name: "read preset A1",
            message: requestPreset(1)
        }, {
            name: "read stompswitch #1 of preset #5",
            message: requestPresetObj(5, 0x0D)
        }, {
            name: "read all presets (takes some time)",
            message: requestAllPresets()
        }],
        customMessage: ""
    };

    /**
     * Ad-hoc method to show the busy flag and set a timeout to make sure the busy flag is hidden after a timeout.
     */
    showBusy = () =>  {
        setTimeout(() => this.props.onBusy(false), 30000);
        this.props.onBusy(true);
    };

    updateCustomMessage = (event) => {
        let s = (event.target.value.toUpperCase().match(/[0-9A-F ]+/g) || []).join('');
        this.setState({
            customMessage: s
        });
    };

    sendCustomMessage = () => {
        if (this.state.customMessage) {
            let data = Array.from(fromHexString(this.state.customMessage, / /g));
            if (data && data.length > 0) {
                data.push(checksum(data));
                this.sendSysex(SYSEX_HEADER.concat(data));
            }
        }
    };

/*
    handleMidiInputEvent = (event) => {
        // console.log("TestSender.handleMidiInputEvent", event, event.data);
        // if (event instanceof MIDIMessageEvent) {
        if (isSysexData(event.data)) {
            this.setState(
                produce(draft => {
                    draft.data = mergeDeep(draft.data || {}, parseSysexDump(event.data));
                    // this.props.onBusy(false);
                })
            )
        } else {
            console.log("MIDI message is not a sysex message")
        }
        // }
    };
*/

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


    setOutput = (port_id) => {
        this.setState({output: port_id});
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

        const { data, messages, customMessage } = this.state;

        const cs = checksum(fromHexString(customMessage, / /g));

/*
        let hex_msg = '';
        if (customMessage.length % 2) {
            hex_msg = hs(customMessage);
        } else {
            hex_msg = hs(customMessage.substring(0, customMessage.length - 1)) + ' ' + customMessage.substr(-1, 1);
        }
*/
        let hex_msg = '';
        for (let i=0; i < customMessage.length; i++) {
            if ((i > 0) && (i % 2 === 0)) hex_msg += ' ';
            hex_msg += customMessage[i];
        }

        return (
            <div className="wrapper">
                <div className="content">

                    <div className="content-row-content">
                        <h2>Test messages:</h2>
                        <div className="content-row-content-content">
                        {messages.map((msg, i) =>
                            <div key={i} className="send-message">
                                <button onClick={() => this.sendMessage(msg.message)}>send</button>
                                <span className="code light">{ hs(SYSEX_SIGNATURE.concat(msg.message.slice(0, 1))) } </span>
                                <span className="code">{ hs(msg.message.slice(1, -1)) } </span>
                                <span className="code light"> {hs(msg.message.slice(-1))}</span>
                                <span className="message-name"> {msg.name}</span>
                            </div>
                        )}
                        </div>
                    </div>

                    <div className="content-row-content">
                        <h2>Custom message:</h2>
                        <div className="content-row-content-content">
                            <div className="send-message">
                                <button onClick={this.sendCustomMessage} disabled={(customMessage.length % 2) !== 0}>send</button>
                                <span className="code light">{hs(SYSEX_SIGNATURE)} {hs(SYSEX_HEADER)} </span>
                                <input type="text" className="code" size="30" value={customMessage}
                                       placeholder={"hex digits only"} onChange={this.updateCustomMessage} />
                                <span className="code light"> {h(cs)}</span>
                            </div>
                            <div className="custom-message code">
                                {hs(SYSEX_SIGNATURE)} {hs(SYSEX_HEADER)} {hex_msg} {h(cs)}
                            </div>
                        </div>
                    </div>

                    <div className="content-row-content">
                        <h2>Response:</h2>
                        <div className="content-row-content-content">
                            <div className="message code">
                                <DumpSysex data={data} />
                            </div>

                        </div>
                    </div>

{/*
                    <div className="content-row-content no-grad">
                        {data &&
                        <div className="debug">
                            <h4>[Debug] sysex data:</h4>
                            <pre>{JSON.stringify(data, null, 4)}</pre>
                        </div>
                        }
                    </div>
*/}

                </div>

                <div className="right-column">
                    <Midi only={ANY_MIDI_PORT} autoConnect={PACER_MIDI_PORT_NAME}
                          portsRenderer={(groupedPorts, clickHandler) => <PortsGrid groupedPorts={groupedPorts} clickHandler={clickHandler} />}
                          onMidiInputEvent={this.handleMidiInputEvent}
                          onOutputConnection={this.setOutput}
                          className="sub-header" >
                        <div className="no-midi">Please connect your Pacer to your computer.</div>
                    </Midi>
                </div>

            </div>

        );
    }
}

export default TestSender;