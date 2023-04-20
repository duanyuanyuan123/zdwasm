echo "Beginning Build:"
rm -r dist
mkdir -p dist/nosimd
mkdir -p dist/simd
#mkdir -p dist/openh264_nosimd
#mkdir -p dist/openh264_simd

#cd ../openh264
#echo "emconfigure openh264...."
#if [ -f "Makefile" ]; then
  #echo "make clean"
  #make clean
#fi
#echo "make"
#emmake --target="wasm32" make CC=emcc CXX=em++ AR=emar RANLIB="emranlib" CFLAGS_OPT="-mwasm64" PREFIX=$(pwd)/../zdwasm/dist/openh264_nosimd
#echo "make install"
#make install

echo "emconfigure with simd"
emconfigure ./configure --cc="emcc" --cxx="em++" --ar="emar" --ranlib="emranlib" --prefix=$(pwd)/../zdwasm/dist/nosimd --enable-cross-compile --target-os=none \
        --arch=x86_32 --cpu=generic --disable-gpl --enable-version3 --disable-avdevice --disable-swresample --disable-postproc --disable-avfilter \
        --disable-programs --disable-logging --disable-everything --enable-avformat --enable-decoder=hevc --enable-decoder=h264 \
        --enable-encoder=h264_qsv --enable-decoder=h264_qsv \
        --enable-decoder=aac --disable-ffplay --disable-ffprobe --disable-asm --disable-doc --disable-devices --disable-network \
        --disable-parsers --disable-bsfs --disable-debug --enable-protocol=file --enable-demuxer=mov --enable-demuxer=flv --enable-demuxer=aac --enable-parser=aac \
          --enable-nonfree --disable-indevs --disable-outdevs \
          --extra-cflags="-Wno-unknown-warning-option -msimd128 -msse -mfloat-abi=softfp -mfpu=neon" \
         --extra-ldflags="-L/opt/intel/mediasdk/lib -s PROXY_TO_PTHREAD=1 -s USE_PTHREADS=1 -s PTHREAD_POOL_SIZE=4"
if [ -f "Makefile" ]; then
  echo "make clean"
  make clean
fi
echo "make"
make
echo "make install"
make install

echo "emconfigure with simd"
emconfigure ./configure --cc="emcc" --cxx="em++" --ar="emar" --ranlib="emranlib" --prefix=$(pwd)/../zdwasm/dist/simd --enable-cross-compile --target-os=none \
        --arch=x86_32 --cpu=generic --disable-gpl --enable-version3 --disable-avdevice --disable-swresample --disable-postproc --disable-avfilter \
        --disable-programs --disable-logging --disable-everything --enable-avformat --enable-decoder=hevc --enable-decoder=h264 \
        --enable-encoder=h264_qsv --enable-decoder=h264_qsv \
        --enable-decoder=aac --disable-ffplay --disable-ffprobe --disable-asm --disable-doc --disable-devices --disable-network \
        --disable-parsers --disable-bsfs --disable-debug --enable-protocol=file --enable-demuxer=mov --enable-demuxer=flv --enable-demuxer=aac --enable-parser=aac \
          --enable-nonfree --disable-indevs --disable-outdevs \
          --extra-cflags="-Wno-unknown-warning-option -msimd128 -msse -mfloat-abi=softfp -mfpu=neon" \
         --extra-ldflags="-L/opt/intel/mediasdk/lib -s PROXY_TO_PTHREAD=1 -s USE_PTHREADS=1 -s PTHREAD_POOL_SIZE=4"
if [ -f "Makefile" ]; then
  echo "make clean"
  make clean
fi
echo "make"
make
echo "make install"
make install

cd ../zdwasm
./build_decoder_wasm.sh
