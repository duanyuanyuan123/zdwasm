

self.Module = {
    onRuntimeInitialized: function () {
        onWasmLoaded();
    }
};

self.importScripts("common.js");
self.importScripts("wasm-feature-detect.js");
// self.importScripts("prod.all.wasm.combine.js");
// (async () => {
//     const hasSIMD = await simd();
//     const module = await (
//       hasSIMD
//         ? self.importScripts("libffmpeg-with-simd.js")//import('./module-with-simd.js')
//         : self.importScripts("libffmpeg.js")
//     );
//     // …now use `module` as you normally would
//   })();

wasmFeatureDetect.simd().then(simdSupported => {
    if (simdSupported) {
        /* SIMD support */
        // console.log("/* SIMD support */")
        self.importScripts("libffmpeg-with-simd.js")
    } else {
        /* No SIMD support */
        // console.log("/* No SIMD support */")
        self.importScripts("libffmpeg.js")
    }
});

function Decoder() {
    this.logger = new Logger("Decoder");
    this.coreLogLevel = 1;
    this.wasmLoaded = false;
    this.tmpReqQue = [];
    this.cacheBuffer = null;
    this.videoDecodeBuffer = null;
    this.videoParamCallback = null;
    this.audioParamCallback = null;
    this.videoCallback = null;
    this.audioCallback = null;
    this.streamParamCallback = null;
    this.videoDemuxeCallback = null;
    this.requestCallback = null;
    this.initialized = false;
    this.webCodecs = null;
    this.useWASM = true;
    this.firstFrame = true;
    this.videoFrameBuffer = [];
    this.auioFrameBuffer = [];
    this.h264Buffer = [];
    this.use_ffmpeg = 1;
    this.logger.logInfo("[ER] Decoder construct.");
    self.postMessage({ t: this.kConsoleReq, c: "Constructor Decoder" });
}

Decoder.prototype.initDecoder = function (fileSize, chunkSize, webCodec, videoDecode) {
    if (this.initialized) {
        return;
    }
    // if ('VideoEncoder' in window) {
    //     // 支持 WebCodecs API
    //     console.log("支持 WebCodecs API");
    // }

    // if ('VideoDecoder' in window) {
    //     // 支持 WebCodecs API
    //     console.log("支持 WebCodecs API");
    // }

    this.initialized = true;
    var ret;
    // 通过 VideoEncoder API 检查当前浏览器是否支持
    if (!videoDecode) {
        // 支持 WebCodecs API
        this.logger.logError("支持 WebCodecs API.");
        console.log("支持 WebCodecs API");
        this.useWASM = false;
        ret = Module._initDecoder(fileSize, this.coreLogLevel, this.videoParamCallback, this.videoCallback,
            this.audioParamCallback, this.audioCallback, this.streamParamCallback, this.videoDemuxeCallback, this.use_ffmpeg);
    } else {
        ret = Module._initDecoder(fileSize, this.coreLogLevel, this.videoParamCallback, this.videoCallback,
            this.audioParamCallback, this.audioCallback, this.streamParamCallback, 0, this.use_ffmpeg);
    }

    if (0 == ret && !this.cacheBuffer) {
        this.cacheBuffer = Module._malloc(chunkSize);
    }

    if (0 == ret && !this.videoDecodeBuffer) {
        this.videoDecodeBuffer = Module._malloc(chunkSize);
    }

    var objData = {
        t: kInitDecoderRsp,
        e: ret
    };
    self.postMessage(objData);

    this.videoFrameBuffer = [];
};

Decoder.prototype.uninitDecoder = function () {
    if (!this.initialized) {
        return;
    }
    this.initialized = false;
    Module._uninitDecoder();

    if (this.webCodecs !== null) {
        this.webCodecs.close();
        this.webCodecs = null;
    }

    if (this.cacheBuffer != null) {
        Module._free(this.cacheBuffer);
        this.cacheBuffer = null;
    }

    if (this.videoDecodeBuffer != null) {
        Module._free(this.videoDecodeBuffer);
        this.videoDecodeBuffer = null;
    }

    // var objData = {
    //     t: kUninitDecoderRsp,
    // };
    // self.postMessage(objData);

    this.videoFrameBuffer = [];
    console.log("unInit decoder");

    // self.close();
};

Decoder.prototype.sendData = function (data) {

    // self.postMessage({ t: 40, c: "收到下载数据" });
    if (this.initialized) {
        const typedArray = new Uint8Array(data);
        Module.HEAPU8.set(typedArray, this.cacheBuffer);
        Module._tryDecode(this.cacheBuffer, typedArray.length);
    }
};

Decoder.prototype.decodeVideo = function (data, s) {

    if (this.initialized) {
        const typedArray = new Uint8Array(data);
        Module.HEAPU8.set(typedArray, this.videoDecodeBuffer);
        Module._decodeVideo(this.videoDecodeBuffer, typedArray.length, s);
    }
};

Decoder.prototype.returnVideoBuffer = function (frame) {
    if (this.videoFrameBuffer.length < 10) {
        this.videoFrameBuffer.push(frame);
    }
};

Decoder.prototype.returnAudioBuffer = function (frame) {
    this.audioFrameBuffer.push(frame);
};

Decoder.prototype.returnH264Buffer = function (frame) {
    this.h264Buffer.push(frame);
};



Decoder.prototype.decodeAudio = function (data, s) {

};


Decoder.prototype.setAudioSpeed = function (speed) {

    if (this.initialized) {
        Module._setAudioSpeed(speed);
    }
    // console.log("SendData.....");

};

Decoder.prototype.processReq = function (req) {
    // this.logger.logInfo("processReq " + req.t + ".");
    switch (req.t) {
        case kInitDecoderReq:
            // this.initDecoder(req.s, req.c, req.win);
            this.initDecoder(req.s, req.c, req.win, req.videoDecode);
            break;
        case kUninitDecoderReq:
            this.uninitDecoder();
            break;
        case kFeedDataReq:
            this.sendData(req.d, req.f);
            break;
        case kSetAudioSpeed:
            this.setAudioSpeed(req.s);
            break;
        case kDecodeVideo:
            this.decodeVideo(req.d, req.s);
            break;
        case kDecodeAudio:
            this.decodeAudio(req.d, req.s);
            break;
        case kReturnVideoBuffer:
            this.returnVideoBuffer(req.f);
            break;
        case kOpenDecoderReq:
            break;
        case kCloseDecoderReq:
            break;
        case kStartDecodingReq:
            break;
        case kPauseDecodingReq:
            break;
        case kSeekToReq:
            break;
        default:
            this.logger.logError("Unsupport messsage " + req.t);
    }
};

Decoder.prototype.cacheReq = function (req) {
    if (req) {
        this.tmpReqQue.push(req);
    }
};

Decoder.prototype.handleFrame = function (frame) {
    console.log("frame: ", frame);
    // var outArray = Module.HEAPU8.subarray(buff, buff + size);
    // var data = new Uint8Array(outArray);
    // var objData = {
    //     t: kVideoFrame,
    //     s: timestamp,
    //     d: data
    // };
    // self.postMessage(objData, [objData.d.buffer]);
}

Decoder.prototype.handleError = function (frame) {
    console.log("frame: ", frame);
    // var outArray = Module.HEAPU8.subarray(buff, buff + size);
    // var data = new Uint8Array(outArray);
    // var objData = {
    //     t: kVideoFrame,
    //     s: timestamp,
    //     d: data
    // };
    // self.postMessage(objData, [objData.d.buffer]);
}

Decoder.prototype.onWasmLoaded = function () {
    if (this.wasmLoaded) {
        return;
    }
    console.log("Wasm loaded.");
    this.wasmLoaded = true;
    let that = this;
    this.videoParamCallback = Module.addFunction(function (duration, fps, bps, fmt, width, height) {
        console.log("video fps : ", fps, "bitrate: ", bps, "width: ", width, "height:", height);
        var videoParam = {
            t: kVideoParam,
            d: duration,
            f: fps,
            b: bps,
            w: width,
            h: height
        }
        self.postMessage(videoParam);
        self.decoder.videoFrameBuffer = [];
        // if (!that.useWASM) {
        //     const format = 'annexb';
        //     const config = {
        //         codec: "avc1.42001f",     //假设当前视频编码codec参数，具体含义，请参考https://zhuanlan.zhihu.com/p/82266810
        //         codecWidth: width,         //解码数据宽度
        //         codecHeight: height,        //解码数据高度
        //         // description: "annexb",        //如果是avc格式，需要提供，annexb则不需要
        //         hardwareAcceleration: "prefer-hardware",
        //         avc: {format,},
        //     }

        //     that.webCodecs = new VideoDecoder({
        //         // error: that.handleError,
        //         // output: that.handleFrame,
        //         output: (chunk) => {
        //             pendingOutputs--;
        //             processChunk(chunk);
        //         },
        //         error: (e) => {
        //             console.log("解码错误: ", e); //vtr.stop();
        //         }
        //     });

        //     that.webCodecs.configure(config);
        // }

    }, 'viiiiii');

    this.videoCallback = Module.addFunction(function (ybuff, ysize, ubuff, usize, vbuff, vsize, timestamp, timeConsuming, init_time, datasize) {
        // return;
        // console.log("video frame callback, timestamp: ", timestamp, "video size: ", size);
        var yArray = Module.HEAPU8.subarray(ybuff, ybuff + ysize);
        var uArray = Module.HEAPU8.subarray(ubuff, ubuff + usize);
        var vArray = Module.HEAPU8.subarray(vbuff, vbuff + vsize);
        if (self.decoder.videoFrameBuffer.length > 0 && self.decoder.videoFrameBuffer[0].y.length < ysize) {
            self.decoder.videoFrameBuffer = [];
        }

        let frame = null;
        if (self.decoder.videoFrameBuffer.length > 0) {
            frame = {
                t: kVideoFrame,
                s: timestamp,
                y: self.decoder.videoFrameBuffer[0].y,
                u: self.decoder.videoFrameBuffer[0].u,
                v: self.decoder.videoFrameBuffer[0].v,
                ys: ysize,
                uvs: usize,
                tc: timeConsuming,
                ds: datasize,
            };
            frame.y.set(yArray);//.slice(0, size);
            frame.u.set(uArray);
            frame.v.set(vArray);
            self.decoder.videoFrameBuffer.shift();
            // console.log("从缓存获取数据");
        }
        else {
            frame = {
                t: kVideoFrame,
                s: timestamp,
                y: new Uint8Array(yArray),
                u: new Uint8Array(uArray),
                v: new Uint8Array(vArray),
                ys: ysize,
                uvs: usize,
                tc: timeConsuming,
                ds: datasize,
            };
        }
        // console.log("frame buf size = ", size);
        self.postMessage(frame, [frame.y.buffer, frame.u.buffer, frame.v.buffer]);
    }, 'viiiiiiddii');

    this.audioParamCallback = Module.addFunction(function (sample_fmt, channels, sample_rate) {
        var audioParam = {
            t: kAudioParam,
            f: sample_fmt,
            c: channels,
            r: sample_rate,
        }
        // console.log("sample rate: ", sample_rate);
        self.postMessage(audioParam);
    }, 'viii');

    this.audioCallback = Module.addFunction(function (buff, size, timestamp, org_datasize) {
        // console.log("this.audioCallback, timestamp: ", timestamp);
        var buffer = Module.HEAPU8.subarray(buff, buff + size);
        // var right = Module.HEAPU8.subarray(rbuff + size / 2, rbuff + size / 2);

        // const start = Date.now();
        var data = new Uint8Array(buffer);
        // var rData = new Uint8Array(right);
        var objData = {
            t: kAudioFrame,
            s: timestamp,
            d: data,
            ds: org_datasize
        };

        // const now = Date.now();
        // const time = now - start;

        // console.log(`post message end, 大小：${objData.d.length},耗时 ${time}ms`);
        self.postMessage(objData, [objData.d.buffer]);

    }, 'viidd');

    this.streamParamCallback = Module.addFunction(function (haveVideo, haveAudio) {
        console.log("Stream video track: ", haveAudio, ", audio track: ", haveAudio);
        var objData = {
            t: kStreamParam,
            v: haveVideo,
            a: haveAudio
        };
        self.postMessage(objData);
    }, 'vii');

    this.videoDemuxeCallback = Module.addFunction(function (buff, size, timestamp, type, org_data_size, profile, level, bps) {
        var outArray = Module.HEAPU8.subarray(buff, buff + size);
        var data = new Uint8Array(outArray);
        var objData = {
            t: kVideoDemuxed,
            s: timestamp,
            d: data,
            tp: type,
            l: size,
            ds: org_data_size,
            pf: profile,
            lv: level,
            b: bps
        };
        self.postMessage(objData, [objData.d.buffer]);
        // const now = Date.now();
        // const time = now - start;

        // console.log(`post message end, 大小：${objData.d.length},耗时 ${time}ms`);
        // let key = (type === 5 ? true : false);
        // if (key && !this.firstFrame) {
        //     that.webCodecs.flush();
        // }
        // that.firstFrame = false;
        // const chunk = new EncodedVideoChunk({
        //     data: d,           //视频数据
        //     timestamp: timestamp,
        //     type: key ? "key" : "delta",
        // });

        // // console.log("decoder status: ", that.webCodecs.state)
        // console.log("decodeQueueSize", that.webCodecs.decodeQueueSize);

        // that.webCodecs.decode(chunk)
        // that.webCodecs.decode(chunk);

        // var objData = {
        //     t: kVideoDemuxed,
        //     s: timestamp,
        //     d: d,
        //     tp: type,
        //     l: size,
        //     ds: org_data_size
        // };

        // console.log("解分离成功---------------------");
    }, 'viididiii');

    while (this.tmpReqQue.length > 0) {
        var req = this.tmpReqQue.shift();
        this.processReq(req);
    }
};

self.decoder = new Decoder;

self.onmessage = function (evt) {

    // if (!self.decoder) {
    //     return;
    // }

    if (!self.decoder.wasmLoaded) {
        self.decoder.cacheReq(evt.data);
        // console.log("Temp cache req " + req.t + ".");
        return;
    }
    self.decoder.processReq(evt.data);
};

function onWasmLoaded() {
    if (self.decoder) {
        self.decoder.onWasmLoaded();
        var videoParam = {
            t: kConsoleReq,
            log: "[ER] onWasmLoaded!"
        }
        self.postMessage(videoParam);
        console.log("[ER] onWasmLoaded!");
    } else {
        var videoParam = {
            t: kConsoleReq,
            log: "[ER] No decoder!"
        }
        self.postMessage(videoParam);
        console.log("[ER] No decoder!");
    }
}
