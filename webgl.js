

function Texture(gl) {
    this.gl = gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

Texture.prototype.bind = function (n, program, name) {
    var gl = this.gl;
    gl.activeTexture([gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2][n]);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program, name), n);
};

Texture.prototype.fill = function (width, height, data) {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.LUMINANCE, width, height, 0, this.gl.LUMINANCE, this.gl.UNSIGNED_BYTE, data);
};

function WebGLPlayer(useOffscreen) {
    this.kConsoleReq = 40;
    if (useOffscreen) {
        postMessage({ t: this.kConsoleReq, c: "Constructor WebGLPlayer" });
    }
    else {
        console.log("Constructor WebGLPlayer");
    }
    this.useOffscreen = useOffscreen;
    this.gl = null;
    this.canvas = null;

}

WebGLPlayer.prototype.initGL = function (options) {
    if (!this.gl) {
        if (this.useOffscreen) {
            postMessage({ t: this.kConsoleReq, c: "[ER] WebGL not supported." });
        }
        else {
            console.log("[ER] WebGL not supported.");
        }

        return;
    }

    var gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    var program = gl.createProgram();
    var vertexShaderSource = [
        "attribute highp vec4 aVertexPosition;",
        "attribute vec2 aTextureCoord;",
        "varying highp vec2 vTextureCoord;",
        "void main(void) {",
        " gl_Position = aVertexPosition;",
        " vTextureCoord = aTextureCoord;",
        "}"
    ].join("\n");
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    var fragmentShaderSource = [
        "precision highp float;",
        "varying lowp vec2 vTextureCoord;",
        "uniform sampler2D YTexture;",
        "uniform sampler2D UTexture;",
        "uniform sampler2D VTexture;",
        "const mat4 YUV2RGB = mat4",
        "(",
        " 1.1643828125, 0, 1.59602734375, -.87078515625,",
        " 1.1643828125, -.39176171875, -.81296875, .52959375,",
        " 1.1643828125, 2.017234375, 0, -1.081390625,",
        " 0, 0, 0, 1",
        ");",
        "void main(void) {",
        " gl_FragColor = vec4( texture2D(YTexture, vTextureCoord).x, texture2D(UTexture, vTextureCoord).x, texture2D(VTexture, vTextureCoord).x, 1) * YUV2RGB;",
        "}"
    ].join("\n");

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        if (this.useOffscreen) {
            postMessage({ t: this.kConsoleReq, c: "[ER] Shader link failed." });
        }
        else {
            console.log("[ER] Shader link failed.");
        }

    }
    var vertexPositionAttribute = gl.getAttribLocation(program, "aVertexPosition");
    gl.enableVertexAttribArray(vertexPositionAttribute);
    var textureCoordAttribute = gl.getAttribLocation(program, "aTextureCoord");
    gl.enableVertexAttribArray(textureCoordAttribute);

    var verticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
    var texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.y = new Texture(gl);
    gl.u = new Texture(gl);
    gl.v = new Texture(gl);
    gl.y.bind(0, program, "YTexture");
    gl.u.bind(1, program, "UTexture");
    gl.v.bind(2, program, "VTexture");
}

WebGLPlayer.prototype.renderFrame = function (y, u, v, width, height, uOffset, vOffset) {
    if (!this.gl) {
        if (this.useOffscreen) {
            postMessage({ t: this.kConsoleReq, c: "[ER] Render frame failed due to WebGL not supported." });
        }
        else {
            console.log("[ER] Render frame failed due to WebGL not supported.");
        }

        return;
    }
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    // this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    // this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    // let yData = videoFrame.slice(0, uOffset);
    // let uData = videoFrame.slice(uOffset, uOffset + vOffset);
    // let vData = videoFrame.slice(uOffset + vOffset, videoFrame.length);
    this.gl.y.fill(width, height, y);
    this.gl.u.fill(width >> 1, height >> 1, u);
    this.gl.v.fill(width >> 1, height >> 1, v);

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    // console.log("[ER] Render frame failed due to WebGL not supported.");
    // this.TransferBuffer();
    // gl.commit();
};

WebGLPlayer.prototype.TransferBuffer = function () {
    let image_bitmap = this.canvas.transferToImageBitmap();
    postMessage({ t: kTransferBuffer, buffer: image_bitmap },
        [image_bitmap]);
}
WebGLPlayer.prototype.fullscreen = function () {
    var canvas = this.canvas;
    if (canvas.RequestFullScreen) {
        canvas.RequestFullScreen();
    } else if (canvas.webkitRequestFullScreen) {
        canvas.webkitRequestFullScreen();
    } else if (canvas.mozRequestFullScreen) {
        canvas.mozRequestFullScreen();
    } else if (canvas.msRequestFullscreen) {
        canvas.msRequestFullscreen();
    } else {
        alert("This browser doesn't supporter fullscreen");
    }
};

WebGLPlayer.prototype.exitfullscreen = function () {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    } else {
        alert("Exit fullscreen doesn't work");
    }
};

WebGLPlayer.prototype.InitRender = function (objData) {
    this.canvas = objData.canvas;
    this.canvas.width = objData.width;
    this.canvas.height = objData.height;

    // this.canvas.addEventListener(
    //     "webglcontextlost", this.handleContextLost, false);
    // this.canvas.addEventListener(
    //     "webglcontextrestored", this.handleContextRestored, false);

    // this.gl.linkProgram(program);

    // if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS) && !this.gl.isContextLost()) {
    //     var info = gl.getProgramInfoLog(program);
    //     console.log('Error linking program:\n' + info);
    // }
    if (this.gl === null) {
        this.gl = this.canvas.getContext("webgl", { alpha: false, depth: false, premultipliedAlpha: false }) || this.canvas.getContext("experimental-webgl", { alpha: false, depth: false, premultipliedAlpha: false }) || this.canvas.getContext("webgl2") || this.canvas.getContext("experimental-webgl2");
    }

    this.initGL();
};

WebGLPlayer.prototype.handleContextLost = function (event) {
    console.log("handleContextLost+++++++++++++++++++++++++++++++++");
    event.preventDefault();
}

WebGLPlayer.prototype.handleContextRestored = function (event) {
    console.log("handleContextRestored-------------------------------");
    this.initGL();
}

WebGLPlayer.prototype.UninitRender = function (objData) {
    if (this.gl !== null) {
        // this.gl.clearColor(128.0, 16, 128.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        // this.gl.deleteProgram(this.program);
        // this.gl.getExtension('WEBGL_lose_context').loseContext();
    }
    this.gl = null;

    // const offscreen = this.canvas.transferControlToOffscreen()
    // postMessage({ t: kUnitRenderRsp, canvas: offscreen}, [offscreen]);
};

self.onmessage = function (evt) {
    if (!self.render) {
        self.render = new WebGLPlayer(true);
    }
    var objData = evt.data;
    switch (objData.t) {
        // case kInitRender:
        case 15:
            self.render.InitRender(objData);
            break;
        // case kRenderFrame:
        case 17:
            self.render.renderFrame(objData.d, objData.w, objData.h, objData.yL, objData.uvL);
            break;
        // case kUnitRender:
        case 22:
            self.render.UninitRender();
            break;
        // case kSetCanvasSize:
        case 23:
            self.render.canvas.width = objData.width;
            self.render.canvas.height = objData.height;
            if (self.useOffscreen) {
                postMessage({ t: this.kConsoleReq, c: "onVideoParam canvas width= " + self.render.canvas.width + self.render.canvas.height });
            }
            else {
                console.log("onVideoParam canvas width= ", self.render.canvas.width, self.render.canvas.height);
            }
            break;
    }
};

