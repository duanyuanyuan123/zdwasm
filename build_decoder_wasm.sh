rm -rf libffmpeg.wasm libffmpeg.js libffmpeg-with-simd.wasm libffmpeg-with-simd.js
export TOTAL_MEMORY=62914560
export EXPORTED_FUNCTIONS="[ \
    '_initDecoder', \
    '_uninitDecoder', \
    '_main',	   \
    '_malloc',     \
    '_free',       \
    '_tryDecode',  \
    '_setAudioSpeed', \
    '_decodeVideo', \
    '_decodeAudio' \
]"

echo "Running Emscripten..."
emcc -std=c++11 decoder.cc aac_decoder.cpp h264_decoder.cpp audio_tag.cpp tag.cpp video_tage.cpp  FlvParser.cpp sonic.cc flv_script.cpp read_bytes.cpp H264Parser.cpp dist/nosimd/lib/libavformat.a dist/nosimd/lib/libavcodec.a dist/nosimd/lib/libavutil.a dist/nosimd/lib/libswscale.a \
    -O3 \
    -I "dist/nosimd/include" \
    -s WASM=1 \
    -s TOTAL_MEMORY=${TOTAL_MEMORY} \
    -s EXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
    -s EXPORTED_RUNTIME_METHODS="['addFunction']" \
    -s RESERVED_FUNCTION_POINTERS=14 \
    -o libffmpeg.js

echo "Running SIMD Emscripten..."
emcc -msimd128 -std=c++11 decoder.cc aac_decoder.cpp h264_decoder.cpp audio_tag.cpp tag.cpp video_tage.cpp  FlvParser.cpp sonic.cc flv_script.cpp read_bytes.cpp H264Parser.cpp dist/simd/lib/libavformat.a dist/simd/lib/libavcodec.a dist/simd/lib/libavutil.a dist/simd/lib/libswscale.a \
    -O3 \
    -I "dist/simd/include" \
    -s WASM=1 \
    -s TOTAL_MEMORY=${TOTAL_MEMORY} \
    -s EXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
    -s EXPORTED_RUNTIME_METHODS="['addFunction']" \
    -s RESERVED_FUNCTION_POINTERS=14 \
    -o libffmpeg-with-simd.js


echo "Finished Build"
