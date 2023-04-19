set EXPORTED_FUNCTIONS="[ '_initDecoder', '_uninitDecoder', '_main',	'_malloc', '_free', '_tryDecode', '_setAudioSpeed']"
$env:TOTAL_MEMORY=62914560

$env:TOTAL_MEMORY

echo "Running Emscripten..."
emcc -msimd128 -std=c++11 decoder.cc aac_decoder.cpp h264_decoder.cpp audio_tag.cpp tag.cpp video_tage.cpp  FlvParser.cpp sonic.cc flv_script.cpp read_bytes.cpp H264Parser.cpp dist/lib/libavformat.a dist/lib/libavcodec.a dist/lib/libavutil.a dist/lib/libswscale.a -O3 -I "dist/include" -s WASM=1 -s ASSERTIONS=1 -s TOTAL_MEMORY=62914560 -s EXPORTED_FUNCTIONS="[ '_initDecoder', '_uninitDecoder', '_main',	'_malloc', '_free', '_tryDecode', '_setAudioSpeed']" -s EXPORTED_RUNTIME_METHODS="['addFunction']" -s RESERVED_FUNCTION_POINTERS=14 -s FORCE_FILESYSTEM=1 -o libffmpeg-with-simd.js
emcc -std=c++11 decoder.cc aac_decoder.cpp h264_decoder.cpp audio_tag.cpp tag.cpp video_tage.cpp  FlvParser.cpp sonic.cc flv_script.cpp read_bytes.cpp H264Parser.cpp dist/lib/libavformat.a dist/lib/libavcodec.a dist/lib/libavutil.a dist/lib/libswscale.a -O3 -I "dist/include" -s WASM=1 -s ASSERTIONS=1 -s TOTAL_MEMORY=62914560 -s EXPORTED_FUNCTIONS="[ '_initDecoder', '_uninitDecoder', '_main',	'_malloc', '_free', '_tryDecode', '_setAudioSpeed']" -s EXPORTED_RUNTIME_METHODS="['addFunction']" -s RESERVED_FUNCTION_POINTERS=14 -s FORCE_FILESYSTEM=1 -o libffmpeg.js
echo "Finished Build"
