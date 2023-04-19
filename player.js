//Player states.
const playerStateIdle = 0;
const playerStatePlaying = 1;
const playerStatePausing = 2;
const playerBufferring = 3;
const playerStateCompleted = 4;

//Constant.
const maxBufferTimeLength = 1 * 1000;
const maxAudioOnlyBufferTimeLength = 1 * 1000;
const downloadSpeedByteRateCoef = 3.0;
const accelrateCoef = 0.025;
const maxVideoBuffer = 8 * 1024 * 1024
const beginTimeNoSkiped = 20;
const audioPacketAccumulated = 50;      //20ms一帧，50为1s 

const streamDoneStatus = 10053;
const reconnectCountMax = 3;

String.prototype.startWith = function (str) {
    var reg = new RegExp("^" + str);
    return reg.test(this);
};

function FileInfo(url) {
    this.url = url;
    this.size = 0;
    this.offset = 0;
    this.chunkSize = 65536;
}

function Player(path, bufferInfo, useOffscreen) {
    this.fileInfo = null;
    this.pcmPlayer = null;
    this.sampleFmt = null;
    this.channels = null;
    this.sampleRate = null;
    this.canvas = null;
    this.webglPlayer = null;
    this.callback = null;
    this.waitHeaderLength = bufferInfo;
    this.duration = 0;
    this.fps = 0;
    this.bps = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.yLength = 0;
    this.uvLength = 0;
    this.audioOnly = false;
    this.playerState = playerStateIdle;
    this.decodeInterval = 5;
    this.downloadTimer = null;
    this.chunkInterval = 200;
    this.downloadSeqNo = 0;
    this.downloading = false;
    this.downloadProto = kProtoHttp;
    this.logTimer = null;
    this.logTimerInterval = 60000;
    this.displayDuration = "00:00:00";
    this.audioEncoding = "";
    this.audioChannels = 0;
    this.audioSampleRate = 0;
    this.encoding = "16bitInt";
    this.seeking = false;  // Flag to preventing multi seek from track.
    this.justSeeked = false;  // Flag to preventing multi seek from ffmpeg.
    this.loadingDiv = null;
    this.buffering = false;
    this.audioFrameBuffer = [];
    this.audioWaitforPlayBuffer = [];
    this.diff = 0;
    this.videoFrameBuffer = [];
    this.isStream = false;
    this.fetchController = null;
    this.streamPauseParam = null;
    this.playbackRate = 1.0;
    this.audioFrameTimestamp = 10000.0;
    this.curTime = 0;
    this.duration = 0;
    this.logger = new Logger("Player");
    this.path = path;
    this.renderWorker = null;
    this.demuxDecodeAudioWorker = null;
    this.decodeVideoWorker = null;
    this.profile_level = "";
    this.amplify = 1.5;
    this.resampleFps = 0;


    this.isResume = false;
    this.isPlayingBackground = true;
    this.haveVideo = 0;
    this.haveAudio = 0;
    this.url = "";
    this.networkStatus = 10052;
    this.downDataAlready = 0;
    this.downloadSpeed = 0.0;
    this.maxBufferVideoFrame = 60;
    this.resampleVideoFrame = 1;
    this.bufferTimeLength = maxBufferTimeLength / 20;
    this.willThrow = false;

    this.webCodecs = null;
    this.useWASM = true;
    this.skipDecode = false;

    this.demuxDecodeWorkerData = 0.0;
    this.demuxDecodeWorkeredData = 0.0;

    this.renderFramecount = 0;
    this.decodeFramecount = 0;
    this.decodeTimeConsuming = 40;
    this.fps = 30;
    this.tc_decode = 0;

    this.offscreen = null;
    this.destroyed = false;

    this.useOffscreen = useOffscreen;
    this.lastSPS = false
    this.encodeSPSPPS = null;
    this.reconnectCount = reconnectCountMax;
    this.requestAnimationFrameId;
    this.pcmPlayerVolume = 1.0;
    this.isMSE();
}

Player.prototype.isMSE = function () {
    if (window.MediaSource) { // (1)
        console.log("The Media Source Extensions API is supported.")
    } else {
        console.log("The Media Source Extensions API is not supported.")
    }
}

Player.prototype.iswebasm = function () {
    var useWasm = 0;
    var webAsmObj = window["WebAssembly"];
    if (typeof webAsmObj === "object") {
        if (typeof webAsmObj["Memory"] === "function") {
            if ((typeof webAsmObj["instantiateStreaming"] === "function") || (typeof webAsmObj["instantiate"] === "function")) {
                useWasm = 1;
                console.log("支持WASM");
            }
            else {
                console.log("不支持WASM");
            }

        }
        else {
            console.log("不支持WASM");
        }
    }
    else {
        console.log("不支持WASM");
    }
}

Player.prototype.initRender = function (path) {
    if (typeof this.canvas.transferControlToOffscreen === "function" && this.useOffscreen) {
        var self = this;
        // console.log("path = " + path);
        this.renderWorker = !this.renderWorker ? new Worker(`${path}/webgl.js`) : this.renderWorker;
        this.renderWorker.onmessage = function (evt) {
            switch (evt.data.t) {
                case kTransferBuffer:
                    self.GetTransferBuffer(evt.data.buffer);
                    break;
                case kUnitRenderRsp:
                    self.UninitRender(evt.data);
                    break;
                case kConsoleReq:
                    console.log(objData.c)
                    break;

            }
        }
    }
    else {
        // console.log("init WebFLPlayer----------------------------------------------");
        if (this.webglPlayer == null) {
            this.webglPlayer = new WebGLPlayer(this.useOffscreen);
        }
    }
}

Player.prototype.UninitRender = function (objData) {
    this.canvas = objData.canvas;
}

Player.prototype.GetTransferBuffer = function (buffer) {
    let context_2d = this.canvas.getContext("2d");
    context_2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context_2d.save();
    context_2d.drawImage(buffer, 0, 0);
    context_2d.restore();
}

Player.prototype.initDecodeWorker = function (path) {
    var self = this;
    // console.log("Player.prototype.initDecodeWorker path = " + path);
    if (this.demuxDecodeAudioWorker === null) {
        console.log("Player.prototype.demuxDecodeAudioWorker path = " + path);
        this.demuxDecodeAudioWorker = new Worker(`${path}/decoder.js`);
        console.log("new worker thread in = " + path);
        this.demuxDecodeAudioWorker.onmessage = function (evt) {
            let objData = evt.data
            switch (objData.t) {
                case kInitDecoderRsp:
                    self.onInitDecoder(objData);
                    console.log("request stream.............");
                    self.requestStream(self.url).then(requestStreamInfo => {
                        if (requestStreamInfo && requestStreamInfo.status) {
                            callback(requestStreamInfo)
                        }
                    });
                    setTimeout(function () {
                        console.log("是否需要重新拉流");
                        if (this.downDataAlready <= 0) {
                            if (this.fetchController) {
                                this.fetchController.abort();
                                this.fetchController = null;
                            }
                        }
                        if (this.reconnectCount > 0 || this.playerState === playerStatePlaying || playerStatePausing === this.playerState) {
                            console.log("重新拉流");
                            this.streamContinue();
                        }
                    }, 3000);
                    break;
                case kUninitDecoderRsp:
                    self.onUninitDecoder(objData);
                    break;
                case kOpenDecoderRsp:
                    self.onOpenDecoder(objData);
                    break;
                case kVideoFrame:
                    // self.onVideoFrame(objData);
                    break;
                case kVideoParam:
                    // self.onVideoParam(objData);
                    break;
                case kAudioFrame:
                    self.onAudioFrame(objData);
                    break;
                case kAudioParam:
                    self.onAudioParam(objData);
                    break;
                case kDecodeFinishedEvt:
                    self.onDecodeFinished(objData);
                    break; De
                case kStreamParam:
                    self.OnStreamParam(objData);
                    break;
                case kFeedDataRsp:
                    break;
                case kRequestDataEvt:
                    self.onRequestData(objData.o, objData.a);
                    break;
                case kSeekToRsp:
                    self.onSeekToRsp(objData.r);
                    break;
                case kVideoDemuxed:
                    self.onVideoDemuxed(objData);
                    break;
                case kSpendDataRsp:
                    self.onCalcQueueLength(objData);
                    break;
                case kConsoleReq:
                    //console.log(objData)
                    break;
            }
        }
    }

    if (this.decodeVideoWorker === null) {
        console.log("Player.prototype.decodeVideoWorker path = " + path);
        this.decodeVideoWorker = new Worker(`${path}/decoder.js`);
        this.decodeVideoWorker.onmessage = function (evt) {
            const objData = evt.data;
            switch (objData.t) {
                case kInitDecoderRsp:
                    self.onInitDecoder(objData);
                    break;
                case kOpenDecoderRsp:
                    self.onOpenDecoder(objData);
                    break;
                case kUninitDecoderRsp:
                    self.onUninitDecoder(objData);
                    break;
                case kVideoFrame:
                    self.onVideoFrame(objData);
                    break;
                case kVideoParam:
                    self.onVideoParam(objData);
                    break;
                case kAudioFrame:
                    // self.onAudioFrame(objData);
                    break;
                case kAudioParam:
                    self.onAudioParam(objData);
                    break;
                case kDecodeFinishedEvt:
                    self.onDecodeFinished(objData);
                    break;
                case kStreamParam:
                    self.OnStreamParam(objData);
                    break;
                case kFeedDataRsp:
                    break;
                case kRequestDataEvt:
                    self.onRequestData(objData.o, objData.a);
                    break;
                case kSeekToRsp:
                    self.onSeekToRsp(objData.r);
                    break;
                case kVideoDemuxed:
                    // self.onVideoDemuxed(objData);
                    break;
                case kAudiooDemuxed:
                    // self.onAudioDemuxed(objData);
                    break;
            }
        }
    }

};

Player.prototype.play = function (url, canvas, callback, waitHeaderLength, isStream, playingBackground = true) {
    console.log("291 line ------ Player.prototype.play, return " + this.playerState);
    if (this.playerState === playerStatePlaying || this.playerState === playerBufferring || this.playerState === playerStateCompleted) {
        var ret = {
            e: -1,
            m: "playing"
        };
        console.log("Player.prototype.play, return " + this.playerState);
        return ret;
    }

    var ret = {
        e: 0,
        m: "Success"
    };

    console.log("play url = ", url);
    if (this.pcmPlayer && this.pcmPlayer.status() !== "running") {
        if (!this.useWASM) {
            for (var i = 0; i < this.videoFrameBuffer.length; i++) {
                this.videoFrameBuffer[i].d.close();
            }
        }
        this.isResume = false;
    }
    this.videoFrameBuffer = [];
    this.audioFrameBuffer = [];
    this.lastSPS = false
    if (this.demuxDecodeAudioWorker === null || this.decodeVideoWorker === null) {
        console.log("this.initDecodeWorker---------------------------");;
        this.initDecodeWorker(this.path);
    }
    do {

        if (!url) {
            ret = {
                e: -1,
                m: "Invalid url"
            };
            this.logger.logError("[ER] playVideo error, url empty.");
            break;
        }

        if (!canvas) {
            ret = {
                e: -2,
                m: "Canvas not set"
            };
            this.logger.logError("[ER] playVideo error, canvas empty.");
            break;
        }

        if (!this.demuxDecodeAudioWorker) {
            ret = {
                e: -4,
                m: "Decoder not initialized"
            };
            this.logger.logError("[ER] Decoder not initialized.");
            break
        }

        if (!this.decodeVideoWorker) {
            ret = {
                e: -4,
                m: "Decoder not initialized"
            };
            this.logger.logError("[ER] Decoder not initialized.");
            break
        }

        if (url.startWith("ws://") || url.startWith("wss://")) {
            this.downloadProto = kProtoWebsocket;
        } else {
            this.downloadProto = kProtoHttp;
        }

        this.audioFrameTimestamp = 0.0;
        this.fileInfo = new FileInfo(url);
        this.canvas = canvas;
        this.callback = callback;
        this.waitHeaderLength = waitHeaderLength || this.waitHeaderLength;

        this.playerState = playerStatePlaying;
        this.isStream = isStream;
        this.url = url;
        this.demuxDecodeWorkerData = 0.0;
        this.renderFramecount = 0;
        this.decodeFramecount = 0;
        this.decodeTimeConsuming = 40;
        this.fps = 30;
        this.isPlayingBackground = playingBackground;
        // 

        if (typeof this.canvas.transferControlToOffscreen === "function" && this.useOffscreen) {
            if (this.renderWorker == null) {
                this.initRender(this.path);
            }
        }
        else {
            if (this.webglPlayer == null) {
                this.webglPlayer = new WebGLPlayer(this.useOffscreen);
                // console.log("new WebGLPlayer   ");
            }

        }


        this.displayLoop();

        this.useWASM = true;
        var webCodec = false;
        // if ('VideoEncoder' in window) {
        //     webCodec = true;
        //     this.useWASM = false;
        //     console.log("支持webcodec......");
        // }

        var req = {
            t: kInitDecoderReq,
            s: this.fileInfo.size,
            c: this.fileInfo.chunkSize,
            win: webCodec,
            videoDecode: false
        };
        this.demuxDecodeAudioWorker.postMessage(req);

        var reqVideo = {
            t: kInitDecoderReq,
            s: this.fileInfo.size,
            c: maxVideoBuffer,
            win: webCodec,
            videoDecode: true
        };
        this.decodeVideoWorker.postMessage(reqVideo);
        // console.log("decodeVideoWorker kInitDecoderReq");
        // this.requestStream(this.url).then(requestStreamInfo => {
        //     if (requestStreamInfo && requestStreamInfo.status) {
        //         callback(requestStreamInfo)
        //     }
        // });

        var self = this;
        this.registerVisibilityEvent(function (visible) {
            if (visible) {
                if (!self.isResume && !self.destroyed && !self.isPlayingBackground) {
                    // console.log("registerVisibilityEvent.... resume---------")
                    self.resume();
                }
                self.isResume = true;
            } else {
                if (self.isResume && !self.destroyed && !self.isPlayingBackground) {
                    // console.log("registerVisibilityEvent.... pause---------")
                    self.pause();
                    self.isResume = false;
                }

            }
        });

        this.destroyed = false;
    } while (false);

    return ret;
};

Player.prototype.pauseStream = function () {
    this.streamPauseParam = {
        url: this.fileInfo.url,
        canvas: this.canvas,
        callback: this.callback,
        waitHeaderLength: this.waitHeaderLength
    }

    cancelAnimationFrame(this.requestAnimationFrameId);

    if (this.webCodecs != null) {
        this.webCodecs.close();
        this.webCodecs = null;
    }
    if (this.demuxDecodeAudioWorker !== null) {
        console.log("demuxDecodeAudioWorker************************");
        this.demuxDecodeAudioWorker.postMessage({
            t: kUninitDecoderReq
        });

    }
    if (this.decodeVideoWorker !== null) {
        console.log("decodeVideoWorker************************");
        this.decodeVideoWorker.postMessage({
            t: kUninitDecoderReq
        });
    }


    this.logger.logInfo("Uniniting decoder.");
    // if (this.pcmPlayer && this.pcmPlayer)
    if (!this.useWASM) {
        for (var i = 0; i < this.videoFrameBuffer.length; i++) {
            this.videoFrameBuffer[i].d.close();
        }

    }
    this.videoFrameBuffer = [];
    this.audioFrameBuffer = [];
    this.audioWaitforPlayBuffer = [];
    this.decodeFramecount = 0;

    if (this.demuxDecodeAudioWorker !== null) {

        this.demuxDecodeAudioWorker.terminate();
        this.demuxDecodeAudioWorker = null;
        console.log("this.demuxDecodeAudioWorker terminate");
    }

    if (this.decodeVideoWorker !== null) {

        this.decodeVideoWorker.terminate();
        this.decodeVideoWorker = null;
        console.log("this.decodeVideoWorker terminate");
    }

    if (this.fetchController) {
        this.fetchController.abort();
        this.fetchController = null;
    }

    this.demuxDecodeWorkerData = 0.0;
    this.demuxDecodeWorkeredData = 0.0;
    this.demuxDecodeWorkerData = 0.0;
    this.renderFramecount = 0;
    this.decodeFramecount = 0;
    this.fps = 30;
    this.tc_decode = 0;
    this.lastSPS = false;
    this.profile_level = "";


    this.fileInfo = null;


    if (this.canvas && (typeof this.canvas.transferControlToOffscreen !== "function" || !this.useOffscreen)) {
        if (this.canvas && this.webglPlayer) {
            if (this.webglPlayer.gl) {
                this.webglPlayer.gl.clear(this.webglPlayer.gl.COLOR_BUFFER_BIT)
            }
        }
        this.webglPlayer.UninitRender();
        this.webglPlayer = null;
    }

    this.canvas = null;
    this.callback = null;
    this.duration = 0;
    // this.pixFmt = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.yLength = 0;
    this.uvLength = 0;
    this.beginTimeOffset = 0;
    // this.decoderState = decoderStateIdle;
    this.playerState = playerStateIdle;
    // console.log("Release Video Frame buffer");
    this.audioFrameBuffer = [];
    if (!this.useWASM) {
        for (var i = 0; i < this.videoFrameBuffer.length; i++) {
            this.videoFrameBuffer[i].d.close();
        }
    }
    this.videoFrameBuffer = [];
    this.audioWaitforPlayBuffer = [];
    this.buffering = false;
    this.streamReceivedLen = 0;
    // this.firstAudioFrame = true;
    this.urgent = false;
    this.seekReceivedLen = 0;
    this.tc_decode = 0;

    // if (this.playerState != playerStatePlaying) {
    //     var ret = {
    //         e: -1,
    //         m: "Not playing"
    //     };
    //     return ret;
    // }

    // this.logger.logInfo("Stop in stream pause.");
    // this.stop();
}

Player.prototype.pause = function () {
    this.isResume = false;
    if (this.pcmPlayer && (this.pcmPlayer.status() !== "closed" || this.pcmPlayer.status() === "running") && this.playerState != playerStateCompleted) {
        this.pcmPlayerVolume = this.pcmPlayer.getVolume();
        this.pcmPlayer.pause();
    }

    if (this.playerState === playerStatePausing || this.playerState === playerStateIdle) {
        var ret = {
            e: -1,
            m: "Not playing"
        };
        // console.log("状态不对，不能暂停");
        return ret;
    }

    //Pause video rendering and audio flushing.
    this.playerState = playerStatePausing;

    if (this.isStream) {
        return this.pauseStream();
    }

    this.logger.logInfo("Pause.");
};

Player.prototype.resumeStream = function () {
    // console.log("Player.prototype.resumeStream, this.playerState = " + this.playerState);

    if (this.playerState === playerStatePlaying || this.playerState === playerBufferring) {
        var ret = {
            e: -1,
            m: "Not pausing"
        };
        // console.log("Player.prototype.resumeStream, return " + this.playerState);
        return ret;
    }

    //Restart video rendering and audio flushing.

    // this.logger.logInfo("Uniniting decoder.");
    // this.decodeWorker.postMessage({
    //     t: kUninitDecoderReq
    // });
    if (!this.useWASM) {
        for (var i = 0; i < this.videoFrameBuffer.length; i++) {
            this.videoFrameBuffer[i].d.close();
        }
    }
    this.videoFrameBuffer = [];
    this.play(this.streamPauseParam.url,
        this.streamPauseParam.canvas,
        this.streamPauseParam.callback,
        this.streamPauseParam.waitHeaderLength,
        true, this.isPlayingBackground);
    this.streamPauseParam = null;
    this.playerState = playerStatePlaying;
    var ret = {
        e: 0,
        m: "Success"
    };

    return ret;
}

Player.prototype.resume = function (fromSeek) {

    // console.log("Resume");
    if (this.pcmPlayer && this.pcmPlayer.resume) {
        //Resume audio context.
        this.pcmPlayer.resume();
        this.pcmPlayer.setVolume(this.pcmPlayerVolume);
        this.isResume = true;
        // console.log("pcmPlayer.resume()=-=-=-=-=-=--==-=-=-===-");
    }

    if (this.isStream) {
        return this.resumeStream();
    }

    // if (this.playerState != playerStatePausing) {
    //     var ret = {
    //         e: -1,
    //         m: "Not pausing"
    //     };
    //     return ret;
    // }

    // if (this.pcmPlayer && this.pcmPlayer.resume) {
    //     //Resume audio context.
    //     this.pcmPlayer.resume();
    // }

    //If there's a flying video renderer op, interrupt it.
    // if (this.videoRendererTimer != null) {
    //     clearTimeout(this.videoRendererTimer);
    //     this.videoRendererTimer = null;
    // }



    // //Restart decoding.

    // this.startDecoding();

    // //Restart track timer.
    // if (!this.seeking) {
    //     this.startTrackTimer();
    // }

    var ret = {
        e: 0,
        m: "Success"
    };
    return ret;
};

Player.prototype.stop = function () {
    this.logger.logInfo("Stop.");
    this.isResume = false;

    console.log("反初始化Render");
    if (this.canvas && this.renderWorker) {
        this.renderWorker.postMessage({ t: kUnitRender });
    }
    if (this.canvas && this.webglPlayer) {
        if (this.webglPlayer.gl) {
            this.webglPlayer.gl.clear(this.webglPlayer.gl.COLOR_BUFFER_BIT)
        }
    }
    this.fileInfo = null;


    if (this.canvas && (typeof this.canvas.transferControlToOffscreen === "function" || this.useOffscreen)) {
        this.renderWorker.terminate();
        this.renderWorker = null;
    }
    else {
        if (this.canvas && this.webglPlayer) {
            if (this.webglPlayer.gl) {
                this.webglPlayer.gl.clear(this.webglPlayer.gl.COLOR_BUFFER_BIT)
            }
        }
        this.webglPlayer = null;

    }

    this.canvas = null;
    this.callback = null;
    this.duration = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.yLength = 0;
    this.uvLength = 0;
    this.beginTimeOffset = 0;
    this.playerState = playerStateIdle;
    console.log("Release Video Frame buffer");
    this.audioFrameBuffer = [];
    if (!this.useWASM) {
        for (var i = 0; i < this.videoFrameBuffer.length; i++) {
            this.videoFrameBuffer[i].d.close();
        }
    }
    this.videoFrameBuffer = [];
    this.audioWaitforPlayBuffer = [];
    this.buffering = false;
    this.streamReceivedLen = 0;
    this.urgent = false;
    this.seekReceivedLen = 0;
    this.tc_decode = 0;
    cancelAnimationFrame(this.requestAnimationFrameId);

    if (this.pcmPlayer && this.pcmPlayer.status() === "running") {
        this.pcmPlayer.destroy();
        this.pcmPlayer = null;
        this.logger.logInfo("Pcm player released.");
    }

    this.logger.logInfo("Closing decoder.");
};

Player.prototype.fullscreen = function () {
    // if (this.webglPlayer) {
    //     this.webglPlayer.fullscreen();
    // }
};

Player.prototype.setVolume = function (volume) {
    this.pcmPlayerVolume = volume;
    this.pcmPlayer.setVolume(volume);
};

Player.prototype.getVolume = function () {
    this.pcmPlayerVolume = this.pcmPlayer.getVolume();
    return this.pcmPlayerVolume;
};

Player.prototype.getState = function () {
    return this.playerState;
};

Player.prototype.setTrack = function (timeTrack, timeLabel) {
    this.timeTrack = timeTrack;
    this.timeLabel = timeLabel;

    if (this.timeTrack) {
        var self = this;
        this.timeTrack.oninput = function () {
            if (!self.seeking) {
                self.seekTo(self.timeTrack.value);
            }
        }
        this.timeTrack.onchange = function () {
            if (!self.seeking) {
                self.seekTo(self.timeTrack.value);
            }
        }
    }
};

Player.prototype.onGetFileInfo = function (info) {
    if (this.playerState == playerStateIdle) {
        return;
    }

    this.logger.logInfo("Got file size rsp:" + info.st + " size:" + info.sz + " byte.");
    if (info.st == 200) {
        this.fileInfo.size = Number(info.sz);
        this.logger.logInfo("Initializing decoder.");
    } else {
        this.reportPlayError(-1, info.st);
    }
};

Player.prototype.onInitDecoder = function (objData) {
    if (this.playerState == playerStateIdle) {
        return;
    }

    this.logger.logInfo("onInitDecoder decoder response " + objData.e + ".");
    if (objData.e == 0) {
        if (!this.isStream) {
            var req = { t: kGetFileInfoReq, u: url, p: this.downloadProto };
        } else {
            this.logger.logInfo("this.requestStream.");
            this.onGetFileInfo({ sz: -1, st: 200 });
        }
    } else {
        this.reportPlayError(objData.e);
    }
};


Player.prototype.onUninitDecoder = function (objData) {
    console.log("Player.prototype.onUninitDecoder。。。。。。。。。");

};

Player.prototype.onOpenDecoder = function (objData) {
};

Player.prototype.OnStreamParam = function (v) {
    this.haveVideo = v.v;
    this.haveAudio = v.a;

    this.bufferTimeLength = (this.haveVideo == 0 ? maxAudioOnlyBufferTimeLength / 20 : maxBufferTimeLength / 20);
}

Player.prototype.handlerFrame = function (frame) {
    // console.log("frame: ", frame);
    // var outArray = Module.HEAPU8.subarray(buff, buff + size);
    // var data = new Uint8Array(outArray);
    // var objData = {
    //     t: kVideoFrame,
    //     s: timestamp,
    //     d: data
    // };
    // self.postMessage(objData, [objData.d.buffer]);
}

Player.prototype.handleError = function (frame) {
    // console.log("frame: ", frame);
    // var outArray = Module.HEAPU8.subarray(buff, buff + size);
    // var data = new Uint8Array(outArray);
    // var objData = {
    //     t: kVideoFrame,
    //     s: timestamp,
    //     d: data
    // };
    // self.postMessage(objData, [objData.d.buffer]);
}

Player.prototype.onVideoParam = function (v) {
    // if (this.playerState == playerStateIdle) {
    //     return;
    // }

    // const config = {
    //     codec:"avc1.640028",     //假设当前视频编码codec参数，具体含义，请参考https://zhuanlan.zhihu.com/p/82266810
    //     codecWidth:width,         //解码数据宽度
    //     codecHeight:height,        //解码数据高度
    //     // description:null        //如果是avc格式，需要提供，annexb则不需要
    // }

    // const videoDecoder = new VideoDecoder({
    //     output: this.handleError,
    //     error: this.handlerFrame,
    //   });

    //   videoDecoder.configure(config);

    this.logger.logInfo("onVideoParam:" + v.d + " fps:" + v.f + " width:" + v.w + " height:" + v.h + ".");
    this.duration = v.d;
    this.fps = v.f;
    // this.pixFmt = v.p;
    //this.canvas.width = v.w;
    //this.canvas.height = v.h;
    if (this.videoWidth !== v.w || this.videoHeight !== v.h) {
        this.videoFrameBuffer = [];
        if (this.webglPlayer !== null) {
            this.webglPlayer.UninitRender();
        }
    }

    this.videoWidth = v.w;
    this.videoHeight = v.h;
    this.yLength = this.videoWidth * this.videoHeight;
    this.uvLength = (this.videoWidth / 2) * (this.videoHeight / 2);
    if (!this.useWASM) {
        this.canvas.width = this.videoWidth;
        this.canvas.height = this.videoHeight;
    }
    else {
        if (typeof this.canvas.transferControlToOffscreen === "function" && this.useOffscreen) {
            // this.offscreen = new OffscreenCanvas(this.videoWidth, this.videoHeight);
            // this.renderWorker.postMessage({ t: kInitRender, canvas: this.offscreen, width: this.videoWidth, height: this.videoHeight }, [this.offscreen]);
            let isOffscreen = this.offscreen ? true : false;
            this.offscreen = !this.offscreen ? this.canvas.transferControlToOffscreen() : this.offscreen;
            if (!isOffscreen) {
                // console.log("this.offscreen ", this.offscreen);
                this.renderWorker.postMessage({ t: kInitRender, canvas: this.offscreen, width: this.videoWidth, height: this.videoHeight }, [this.offscreen]);
            } else {
                this.renderWorker.postMessage({ t: kSetCanvasSize, width: this.videoWidth, height: this.videoHeight })
            }


        }
        else {
            this.canvas.width = this.videoWidth;
            this.canvas.height = this.videoHeight;
            this.webglPlayer.InitRender({ t: kInitRender, canvas: this.canvas, width: this.videoWidth, height: this.videoHeight });
        }
    }

    this.callback({ status: 200, info: "Decoder ready now." })
};

Player.prototype.onAudioParam = function (a) {
    if (this.playerState == playerStateIdle) {
        return;
    }

    this.logger.logInfo("Audio param sampleFmt:" + a.f + " channels:" + a.c + " sampleRate:" + a.r + ".");
    // var sampleFmt = a.f;
    // var channels = a.c;
    // var sampleRate = a.r;
    // if (this.sampleFmt == a.f && this.channels == a.c && this.sampleRate && a.r) {
    //     return
    // }
    this.sampleFmt = a.f;
    this.channels = a.c;
    this.sampleRate = a.r;

    switch (this.sampleFmt) {
        case 0:
            this.encoding = "8bitInt";
            break;
        case 1:
        case 6:
            this.encoding = "16bitInt";
            break;
        case 2:
            this.encoding = "32bitInt";
            break;
        case 3:
        case 8:
            this.encoding = "32bitFloat";
            break;
        default:
            this.logger.logError("Unsupported audio sampleFmt " + this.sampleFmt + "!");
    }
    this.logger.logInfo("Audio encoding " + this.encoding + ".");
    if (this.pcmPlayer === null || this.pcmPlayer === undefined) {
        this.pcmPlayer = new PCMPlayer({
            encoding: this.encoding,
            channels: this.channels,
            sampleRate: this.sampleRate,
            flushingTime: 1000
        }, this.onAudioFramePlaybackEnd, this);
    }

    if (this.pcmPlayer.status() !== "running") {
        this.pcmPlayer.resume();

    }
    this.pcmPlayer.setVolume(this.pcmPlayerVolume);

    this.audioEncoding = this.encoding;
    this.audioChannels = this.channels;
    this.audioSampleRate = this.sampleRate;
    // if(this.haveVideo === 0)
    // {
    this.callback({ status: 200, info: "Decoder ready now." })
    // }
};

Player.prototype.clearCache = function () {
    // this.videoFrameBuffer = [];
    // // this.audioFrameBuffer = [];
    // // this.audioWaitforPlayBuffer = [];
    // this.buffering = false;
    // var isiOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终端
    // // if (!isiOS) {
    // //     this.restartAudio();
    // // }
    // console.log("清空缓存...");
}

Player.prototype.restartAudio = function () {

    if (this.pcmPlayer) {
        this.pcmPlayerVolume = this.pcmPlayer.getVolume();
        this.pcmPlayer.pause();
        this.pcmPlayer.destroy();
        this.pcmPlayer = null;
    }

    this.pcmPlayer = new PCMPlayer({
        encoding: this.encoding,
        channels: this.audioChannels,
        sampleRate: this.audioSampleRate,
        flushingTime: 1000
    });

    this.pcmPlayer.resume();
    this.pcmPlayer.setVolume(this.pcmPlayerVolume);
};

Player.prototype.destroy = function () {
    // this.pause();
    this.stop();
    // if (this.renderWorker) {
    //     this.renderWorker.terminate();
    //     this.renderWorker = null;
    // }

    if (this.demuxDecodeAudioWorker) {
        this.demuxDecodeAudioWorker.terminate();
        this.demuxDecodeAudioWorker = null;
    }

    if (this.decodeVideoWorker) {
        this.decodeVideoWorker.terminate();
        this.decodeVideoWorker = null;
    }

    this.canvas = null;

    this.destroyed = true;
};

Player.prototype.bufferFrame = function (frame) {

    // console.log("buffer frame................");
    // if (!this.isResume || (this.pcmPlayer && this.pcmPlayer.status() !== "running")) {
    //     if (!this.useWASM) {
    //         for (var i = 0; i < this.videoFrameBuffer.length; i++) {
    //             this.videoFrameBuffer[i].d.close();
    //         }
    //     }
    //     this.videoFrameBuffer = [];
    //     this.audioFrameBuffer = [];
    //     return
    // }

    // if (frame.t == kAudioFrame) {
    //     // this.displayAudioFrame(frame);

    // } else if (frame.t == kVideoFrame) {
    //     // return;

    // } else {
    //     // this.logger.logInfo("Frame type : ." + frame.t + ", other frame type");
    // }
}

Player.prototype.displayAudioFrame = function (frame) {
    if (this.playerState != playerStatePlaying) {
        return false;
    }
    // if (this.pcmPlayer === null || this.pcmPlayer === undefined) {
    //     this.pcmPlayer = new PCMPlayer({
    //         encoding: this.encoding,
    //         channels: frame.c,
    //         sampleRate: frame.r,
    //         flushingTime: 1000
    //     });
    // }
    this.pcmPlayer.play(frame.d, frame.s, this.onAudioFramePlaybackEnd, this);
    this.audioWaitforPlayBuffer.push(frame.s);
};

Player.prototype.onAudioFramePlaybackEnd = function (info, self) {
    // console.log(" onended, timestamp =  " + info.srcElement.timestamp + ", audiotimestamp = " + self.audioWaitforPlayBuffer[self.audioWaitforPlayBuffer.length - 1]);
    self.audioWaitforPlayBuffer.shift();
    self.audioFrameTimestamp = info.srcElement.timestamp;

    // console.log(info.srcElement.msg);
    let timestampDiff = self.audioWaitforPlayBuffer[self.audioWaitforPlayBuffer.length - 1] - self.audioFrameTimestamp;

    if (self.audioWaitforPlayBuffer.length < 2) {           //40ms
        if (self.playbackRate !== (1.0 - 3 * accelrateCoef)) {
            self.playbackRate = 1.0 - 3 * accelrateCoef;
        }
        if (self.demuxDecodeAudioWorker !== null) {
            var req = {
                t: kSetAudioSpeed,
                s: self.playbackRate
            };
            self.demuxDecodeAudioWorker.postMessage(req);

        }
    }
    else if (self.audioWaitforPlayBuffer.length < 4) {   //30ms -- 40ms
        if (self.playbackRate !== (1.0 - 2 * accelrateCoef)) {
            self.playbackRate = 1.0 - 2 * accelrateCoef;
            if (self.demuxDecodeAudioWorker !== null) {
                var req = {
                    t: kSetAudioSpeed,
                    s: self.playbackRate
                };
                self.demuxDecodeAudioWorker.postMessage(req);

            }
        }
    }
    else if (self.audioWaitforPlayBuffer.length < 6) {  //40ms -- 60ms
        if (self.playbackRate !== (1.0 - accelrateCoef)) {
            self.playbackRate = 1.0 - accelrateCoef;
            if (self.demuxDecodeAudioWorker !== null) {
                var req = {
                    t: kSetAudioSpeed,
                    s: self.playbackRate
                };
                self.demuxDecodeAudioWorker.postMessage(req);

            }
        }
    }
    else {
        if (timestampDiff > 1.0 && timestampDiff <= 1.5) {
            if (self.playbackRate !== (1.0 + accelrateCoef)) {
                if (timestampDiff > 1.3) {
                    self.playbackRate = 1.0 + accelrateCoef;
                    if (self.demuxDecodeAudioWorker !== null) {
                        var req = {
                            t: kSetAudioSpeed,
                            s: self.playbackRate
                        };
                        self.demuxDecodeAudioWorker.postMessage(req);

                    }
                }
            }

        }
        else if (timestampDiff > 1.5 && timestampDiff <= 3.0) {
            if (self.playbackRate !== (1 + 4 * accelrateCoef)) {
                self.playbackRate = (1 + 4 * accelrateCoef)
                if (self.demuxDecodeAudioWorker !== null) {
                    var req = {
                        t: kSetAudioSpeed,
                        s: self.playbackRate
                    };
                    self.demuxDecodeAudioWorker.postMessage(req);

                }
            }
        }
        else if (timestampDiff > 3.0 && timestampDiff <= 4.0) {
            if (self.playbackRate !== (1 + 6 * accelrateCoef)) {
                self.playbackRate = (1 + 6 * accelrateCoef)
                if (self.demuxDecodeAudioWorker !== null) {
                    var req = {
                        t: kSetAudioSpeed,
                        s: self.playbackRate
                    };
                    self.demuxDecodeAudioWorker.postMessage(req);

                }
            }
        }
        else if (timestampDiff > 4.0) {
            if (self.playbackRate !== (1 + 10 * accelrateCoef)) {
                self.playbackRate = (1 + 10 * accelrateCoef)
                if (self.demuxDecodeAudioWorker !== null) {
                    var req = {
                        t: kSetAudioSpeed,
                        s: self.playbackRate
                    };
                    self.demuxDecodeAudioWorker.postMessage(req);

                }
            }
        } else {
            if (self.playbackRate !== 1.0) {
                self.playbackRate = 1.0;
                if (self.demuxDecodeAudioWorker !== null) {
                    var req = {
                        t: kSetAudioSpeed,
                        s: self.playbackRate
                    };
                    self.demuxDecodeAudioWorker.postMessage(req);

                }
            }
        }
    }

};

Player.prototype.setBufferTimeLength = function (microsecond) {
    this.bufferTimeLength = microsecond / 20;
}

Player.prototype.getStatus = function () {
    // for(var i = 0; i < 1000; i++)
    //     console.log("dom节点增加");
    return {
        "videoFrame": this.videoFrameBuffer.length,
        "audioFrame": this.audioWaitforPlayBuffer.length,
        "playbackRate": this.playbackRate,
        "network": this.audioFrameBuffer.length,
        "targetbps": this.bps,
        "remainTotal": ((this.demuxDecodeWorkerData - this.demuxDecodeWorkeredData) * 1.0 / 1000 / 1000).toFixed(3),
        "fps": this.fps,
        "decodeFps": (1000.0 / this.decodeTimeConsuming).toFixed(0),
        "downloadSpeed": this.bps
    };

}
Player.prototype.onAudioFrame = function (frame) {
    this.demuxDecodeWorkeredData = frame.ds;

    if (!this.isResume || (this.pcmPlayer && this.pcmPlayer.status() !== "running")) {
        if (!this.useWASM) {
            for (var i = 0; i < this.videoFrameBuffer.length; i++) {
                this.videoFrameBuffer[i].d.close();
            }
        }
        this.videoFrameBuffer = [];
        this.audioFrameBuffer = [];
        return
    }


    if (!this.buffering && this.audioWaitforPlayBuffer.length <= 1) {
        this.startBuffering();
    }

    if (this.audioFrameBuffer.length >= this.bufferTimeLength && this.buffering) {
        this.stopBuffering();
    }

    if (this.buffering) {
        this.audioFrameBuffer.push(frame);
    } else {
        if (this.audioFrameBuffer.length > 0) {
            //强制显示一帧视频
            if (this.videoFrameBuffer.length > 0) {
                if (this.displayVideoFrame(this.videoFrameBuffer[0], true)) {
                    this.videoFrameBuffer.shift();
                }
            }

            let count = this.audioFrameBuffer.length;
            for (var i = 0; i < count; i++) {
                this.displayAudioFrame(this.audioFrameBuffer[i]);
            }
            this.audioFrameBuffer = [];
        }
        else {
            // console.log("this.audioWaitforPlayBuffer.length = ",  this.audioWaitforPlayBuffer.length);
            this.displayAudioFrame(frame);
        }
    }
};

Player.prototype.getBufferTimerLength = function () {
    if (!this.audioFrameBuffer || this.audioFrameBuffer.length == 0) {
        return 0;
    }

    // let oldest = this.audioFrameBuffer[0];
    // let newest = this.audioFrameBuffer[this.audioFrameBuffer.length - 1];
    // console.log("newest.s = ", newest.s, ", oldest.s = ", oldest.s, "(newest.s - oldest.s) * 1000 = ", (newest.s - oldest.s) * 1000, " ms", "this.audioFrameBuffer length = ", this.audioFrameBuffer.length);
    return this.audioFrameBuffer.length;
};

Player.prototype.onVideoFrame = function (frame) {
    if (this.decodeFramecount > 0)
        this.decodeFramecount--;

    this.tc_decode = (this.tc_decode == 0 ? frame.tc : (this.tc_decode + frame.tc) / 2);

    if (this.videoFrameBuffer.length > this.maxBufferVideoFrame) {
        for (var i = 0; i < this.videoFrameBuffer.length; i += this.resampleVideoFrame) {
            if (!this.useWASM) {
                this.videoFrameBuffer[i].d.close();
            }
            this.videoFrameBuffer.splice(i, 1);
            // if (this.useWASM && videoFrames.length > 0) {
            //     for (let i = 0; i < videoFrames.length; i++) {
            //         var videoFrame = videoFrames[i];
            //         let objData = {
            //             t: kReturnVideoBuffer,
            //             f: videoFrame
            //         };
            //         this.decodeVideoWorker.postMessage(objData, [objData.f.y.buffer, objData.f.u.buffer, objData.f.v.buffer]);
            //     }
            // }
        }
        // console.log("drop some frames---------------------->");
    }

    if (this.resampleFps > 3) {
        this.resampleFps = 0;
        if (!this.useWASM) {
            frame.d.close();
        }
        else {
            let objData = {
                t: kReturnVideoBuffer,
                f: frame
            };
            this.decodeVideoWorker.postMessage(objData, [objData.f.y.buffer, objData.f.u.buffer, objData.f.v.buffer]);
        }
        return;
    }
    this.resampleFps++;
    this.videoFrameBuffer.push(frame);


};

function concatUint8(...args) {
    const length = args.reduce((len, cur) => (len += cur.byteLength), 0);
    const result = new Uint8Array(length);

    let offset = 0;
    args.forEach(uint8 => {
        result.set(uint8, offset);
        offset += uint8.byteLength;
    });

    return result;
}

Player.prototype.onVideoDemuxed = function (encoded) {

    this.demuxDecodeWorkeredData = encoded.ds;
    this.bps = encoded.b;
    if (this.useWASM) {
        let fps = (this.tc_decode == 0 ? this.fps : 1000.0 / this.tc_decode);
        let bDecPower = (fps >= this.fps);
        if (!bDecPower && this.decodeFramecount >= 120) {
            this.skipDecode = true;
            // console.log("扔掉P帧，只要关键帧---------------------->", this.tc_decode);
        }
        if (!this.skipDecode || (encoded.tp === 5 || encoded.tp == 7 || encoded.tp == 8)) {
            this.decodeVideoWorker.postMessage({ t: kDecodeVideo, d: encoded.d, s: encoded.s }, [encoded.d.buffer]);
            this.decodeFramecount++;
            this.skipDecode = false;
        }
        // else{
        //     console.log("skip p Frame");
        // }
    }
    else {

        let profile_level = "avc1." + encoded.pf.toString(16) + "00" + encoded.lv.toString(16);
        if ((this.webCodecs === null) && encoded.pf > 0 && encoded.lv > 0) {
            if (this.profile_level !== profile_level) {
                this.profile_level = profile_level;
                const config = {
                    codec: profile_level,     //假设当前视频编码codec参数，具体含义，请参考https://zhuanlan.zhihu.com/p/82266810
                    // codedWidth: 1280,         //解码数据宽度
                    // codedHeight: 720,        //解码数据高度
                    // description: "annexb",        //如果是avc格式，需要提供，annexb则不需要
                    hardwareAcceleration: 'prefer-hardware',
                    // avc : { format: "annexb" },
                    framerate: 25
                }
                let that = this;
                const init = {
                    output: (chunk) => {
                        if (that.canvas.width !== chunk.displayWidth || that.canvas.height !== chunk.displayHeight) {
                            that.canvas.width = chunk.displayWidth;
                            that.canvas.height = chunk.displayHeight;
                        }
                        var objData = {
                            t: kVideoFrame,
                            s: chunk.timestamp * 1.0 / 1000,
                            d: chunk,
                            tc: 25,
                            ds: 0
                        };
                        // console.log("webocec output frame", chunk);
                        that.onVideoFrame(objData);
                    },
                    error: (e) => {
                        console.log(e.message);
                    }
                };
                this.webCodecs = new VideoDecoder(init);

                this.webCodecs.configure(config);
            }

        }
        if (encoded.tp === 8) {
            this.lastSPS = true;
            this.encodeSPSPPS = encoded.d;
            this.webCodecs.flush();
            return;
        }
        else {
            if (this.lastSPS) {
                encoded.d = concatUint8(this.encodeSPSPPS, encoded.d);
                this.lastSPS = false
            }
        }

        let key = ((encoded.tp === 5 || encoded.tp == 7 || encoded.tp == 8) ? true : false);
        const chunk = new EncodedVideoChunk({
            data: encoded.d,           //视频数据
            timestamp: encoded.s,
            type: key ? "key" : "delta",
        });
        this.webCodecs.decode(chunk);

    }


};

Player.prototype.displayVideoFrame = function (frame, force) {
    // if (this.playerState != playerStatePlaying) { return false; }

    if ((this.audioFrameTimestamp >= frame.s) || force) {
        this.renderVideoFrame(frame);
        return true;
    }

    return false;
};

Player.prototype.onSeekToRsp = function (ret) {
    if (ret != 0) {
        this.justSeeked = false;
        this.seeking = false;
    }
};

Player.prototype.onRequestData = function (offset, available) {
    if (this.justSeeked) {
        this.logger.logInfo("Request data " + offset + ", available " + available);
        if (offset == -1) {
            // Hit in buffer.
            let left = this.fileInfo.size - this.fileInfo.offset;
            if (available >= left) {
                this.logger.logInfo("No need to wait");
                this.resume();
            } else {
                this.startDownloadTimer();
            }
        } else {
            if (offset >= 0 && offset < this.fileInfo.size) {
                this.fileInfo.offset = offset;
            }
            this.startDownloadTimer();
        }

        this.justSeeked = false;
    }
};

Player.prototype.displayLoop = function () {
    this.requestAnimationFrameId = requestAnimationFrame(this.displayLoop.bind(this));
    if (this.playerState !== playerStatePlaying) {
        return;
    }


    while (this.videoFrameBuffer.length > 0) {
        var videoFrame = this.videoFrameBuffer[0];
        if (this.displayVideoFrame(videoFrame, false)) {
            if (this.useWASM) {
                let objData = {
                    t: kReturnVideoBuffer,
                    f: videoFrame
                };
                this.decodeVideoWorker.postMessage(objData, [objData.f.y.buffer, objData.f.u.buffer, objData.f.v.buffer]);
            }
            this.videoFrameBuffer.shift();
        }
        else break;
    }
};

Player.prototype.startBuffering = function () {
    this.playerState = playerBufferring;
    this.buffering = true;
    console.log("start buffering.......");
}

Player.prototype.stopBuffering = function () {
    this.playerState = playerStatePlaying;
    this.buffering = false;
    console.log("stop buffering.......");
    // this.hideLoading();
}


Player.prototype.renderVideoFrame = function (frame) {
    if (this.useWASM) {
        if (typeof this.canvas.transferControlToOffscreen === "function" && this.useOffscreen) {
            var objData = {
                t: kRenderFrame,
                d: frame.d,
                w: this.videoWidth,
                h: this.videoHeight,
                yL: this.yLength,
                uvL: this.uvLength
            };
            this.renderWorker.postMessage(objData, [frame.d.buffer]);
        }
        else {
            this.webglPlayer.renderFrame(frame.y, frame.u, frame.v, this.videoWidth, this.videoHeight, frame.ys, frame.uvs);
        }
    }
    else {
        // console.log("webcodec 解码渲染--------------------------");
        const context = this.canvas.getContext("2d");
        context.drawImage(frame.d, 0, 0);
        frame.d.close();              //不忘记释放资源
    }

};

Player.prototype.downloadOneChunk = function () {
    if (this.downloading || this.isStream) {
        return;
    }

    var start = this.fileInfo.offset;
    if (start >= this.fileInfo.size) {
        this.logger.logError("Reach file end.");
        this.stopDownloadTimer();
        return;
    }

    var end = this.fileInfo.offset + this.fileInfo.chunkSize - 1;
    if (end >= this.fileInfo.size) {
        end = this.fileInfo.size - 1;
    }

    var len = end - start + 1;
    if (len > this.fileInfo.chunkSize) {
        console.log("Error: request len:" + len + " > chunkSize:" + this.fileInfo.chunkSize);
        return;
    }

    var req = {
        t: kDownloadFileReq,
        u: this.fileInfo.url,
        s: start,
        e: end,
        q: this.downloadSeqNo,
        p: this.downloadProto
    };
    this.downloadWorker.postMessage(req);
    this.downloading = true;
};

Player.prototype.reportPlayError = function (error, status, message) {
    var e = {
        error: error || 0,
        status: status || 0,
        message: message
    };
    // this.pause();
    if (this.callback) {
        this.callback(e);
    }
};


Player.prototype.setMaxVidoeFrames = function (maxVideoFrame) {
    this.maxBufferVideoFrame = maxVideoFrame;
}

Player.prototype.setLoadingDiv = function (loadingDiv) {
    this.loadingDiv = loadingDiv;
}

Player.prototype.hideLoading = function () {
    if (this.loadingDiv != null) {
        loading.style.display = "none";
    }
};

Player.prototype.showLoading = function () {
    if (this.loadingDiv != null) {
        loading.style.display = "block";
    }
};

Player.prototype.registerVisibilityEvent = function (cb) {
    var hidden = "hidden";

    // Standards:
    if (hidden in document) {
        document.addEventListener("visibilitychange", onchange);
    } else if ((hidden = "mozHidden") in document) {
        document.addEventListener("mozvisibilitychange", onchange);
    } else if ((hidden = "webkitHidden") in document) {
        document.addEventListener("webkitvisibilitychange", onchange);
    } else if ((hidden = "msHidden") in document) {
        document.addEventListener("msvisibilitychange", onchange);
    } else if ("onfocusin" in document) {
        // IE 9 and lower.
        document.onfocusin = document.onfocusout = onchange;
    } else {
        // All others.
        window.onpageshow = window.onpagehide = window.onfocus = window.onblur = onchange;
    }

    function onchange(evt) {
        var v = true;
        var h = false;
        var evtMap = {
            focus: v,
            focusin: v,
            pageshow: v,
            blur: h,
            focusout: h,
            pagehide: h
        };

        evt = evt || window.event;
        var visible = v;
        if (evt.type in evtMap) {
            visible = evtMap[evt.type];
        } else {
            visible = this[hidden] ? h : v;
        }
        cb(visible);
    }

    // set the initial state (but only if browser supports the Page Visibility API)
    if (document[hidden] !== undefined) {
        onchange({ type: document[hidden] ? "blur" : "focus" });
    }
}

Player.prototype.streamDone = function () {
    console.log("stream done.......................................");
}

Player.prototype.streamContinue = function () {
    // console.log("stream done.......................................");

    if (this.playerState === playerStateCompleted) {
        this.streamPauseParam = {
            url: this.fileInfo.url,
            canvas: this.canvas,
            callback: this.callback,
            waitHeaderLength: this.waitHeaderLength
        }
        this.pause();
        this.resume();
    }
}

Player.prototype.requestStream = async function (url) {
    // if (this.networkStatus === 0) {
    //     //防止多个同时下载
    //     console.log("防止多个线程同时下载");
    //     return;
    // }
    var self = this;
    this.fetchController = new AbortController();
    const signal = this.fetchController.signal;

    fetch(url, { signal }).then(async function respond(response) {
        if (response && response.status == 403) {
            self.reportPlayError(response.status, response.status, 'request url is expire');
            return { status: response.status }
        }
        const reader = response.body.getReader();

        self.networkStatus = 0;
        self.reconnectCount = reconnectCountMax;
        // console.log("self.playerState : ", self.playerState);
        // infinite loop while the body is downloading
        while (true) {

            const { done, value } = await reader.read();

            if (done) {
                console.log("Stream done.");
                self.networkStatus = streamDoneStatus;
                self.playerState = playerStateCompleted;
                self.streamDone();
                // self.reportPlayError(streamDoneStatus, 0, 'stream is ended');
                return;
            }

            if (self.playerState !== playerStatePlaying && self.playerState !== playerBufferring) {
                // console.log("Player.prototype.requestStream-> abort fetch");
                return;
            }
            var dataLength = value.byteLength;
            self.downDataAlready = dataLength > 0 ? 1 : 0;
            var offset = 0;
            if (dataLength > self.fileInfo.chunkSize) {
                do {
                    // if (self.playerState === playerStatePlaying || self.playerState === playerBufferring) {
                    let len = Math.min(self.fileInfo.chunkSize, dataLength);
                    var data = value.buffer.slice(offset, offset + len);
                    dataLength -= len;
                    offset += len;
                    // var objData = {
                    //     t: kFeedDataReq,
                    //     d: data,
                    //     f: false,
                    //     s: len
                    // };
                    self.demuxDecodeWorkerData += len;
                    //console.log("1691-------------------value.byteLength = ", len, "self.demuxDecodeWorkerData = ", self.demuxDecodeWorkerData.toString());
                    self.demuxDecodeAudioWorker.postMessage({
                        t: kFeedDataReq,
                        d: data,
                        f: false,
                        s: len
                    }, [data]);

                    if (self.haveVideo === 1) {
                        if (self.bps > 0) {
                            while (self.demuxDecodeWorkerData - self.demuxDecodeWorkeredData > (self.bps * 1000 / 8) * 2 || self.audioWaitforPlayBuffer.length > audioPacketAccumulated * 3) {
                                // console.log("1658  积累数据： ", (self.demuxDecodeWorkerData - self.demuxDecodeWorkeredData), "码率时长数据： ", (self.bps * 1000 / 8) * 2);
                                await new Promise(r => setTimeout(r, 100));
                            }
                        }

                    }
                } while (dataLength > 0)
            } else {
                // if (self.playerState === playerStatePlaying || self.playerState === playerBufferring) {
                // var objData = {
                //     t: kFeedDataReq,
                //     d: value.buffer,
                //     f: false,
                //     s: value.byteLength
                // };
                self.demuxDecodeWorkerData += value.byteLength;
                //console.log("1713-------------------value.byteLength = ", value.byteLength, "self.demuxDecodeWorkerData = ", self.demuxDecodeWorkerData.toString());
                self.demuxDecodeAudioWorker.postMessage({
                    t: kFeedDataReq,
                    d: value.buffer,
                    f: false,
                    s: value.byteLength
                }, [value.buffer]);
                // }
                if (self.haveVideo === 1) {
                    if (self.bps > 0) {

                        while (self.demuxDecodeWorkerData - self.demuxDecodeWorkeredData > (self.bps * 1000.0 / 8 * 2) || self.audioWaitforPlayBuffer.length > audioPacketAccumulated * 3) {
                            // console.log("暂缓读取缓存1s")
                            // console.log("1658  积累数据： ", (self.demuxDecodeWorkerData - self.demuxDecodeWorkeredData), "码率时长数据： ", (self.bps * 1000 / 8) * 2);
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                }

            }
        }
    }).catch(err => {
        if (err.name === 'AbortError') {
            console.log('Fetch was aborted');
            this.reportPlayError(this.networkStatus, this.networkStatus, 'Fetch was aborted');
        }
        else {
            console.log("Error:", err);
            if (this.reconnectCount <= 0 || this.playerState === playerStatePausing || playerStateIdle === this.playerState) {
                this.networkStatus = 10052;
                this.reportPlayError(10052, 0, 'stream is ended or reconnected 3 times failed');
                console.log("----------------网络错误, 重连次数：", this.reconnectCount);
            }
            else {
                console.log("++++++++++++网络错误, 重连次数：", this.reconnectCount);
                this.networkStatus = streamDoneStatus;
                this.playerState = playerStateCompleted;
                var self = this;
                setTimeout(function () {
                    self.reconnectCount--;
                    console.log("++++++++++++网络错误, 重连次数：", self.reconnectCount);
                    if (self.reconnectCount > 0 || self.playerState === playerStatePausing || playerStateIdle === self.playerState)
                        self.streamContinue();
                }, 2500);
                // this.streamDone();
            }
        }


    });

    // console.log("Player.prototype.requestStream has exit.........");

};