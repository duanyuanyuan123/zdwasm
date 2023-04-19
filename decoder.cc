#include <stdio.h>
#include <sys/time.h>
#include <sys/timeb.h>
#include <unistd.h>
#include <chrono>
#include <iostream>

#include "FlvParser.h"

#ifdef __cplusplus
extern "C"
{
#endif

#include "libavcodec/avcodec.h"
#include "libavformat/avformat.h"
#include "libavutil/fifo.h"
    //#include "libswscale/swscale.h"

#define MIN(X, Y) ((X) < (Y) ? (X) : (Y))

    const int kCustomIoBufferSize = 32 * 1024;
    const int kInitialPcmBufferSize = 128 * 1024;
    const int kDefaultFifoSize = 1 * 1024 * 1024;
    const int kMaxFifoSize = 16 * 1024 * 1024;


    // typedef enum ErrorCode
    // {
    //     kErrorCode_Success = 0,
    //     kErrorCode_Invalid_Param,
    //     kErrorCode_Invalid_State,
    //     kErrorCode_Invalid_Data,
    //     kErrorCode_Invalid_Format,
    //     kErrorCode_NULL_Pointer,
    //     kErrorCode_Open_File_Error,
    //     kErrorCode_Eof,
    //     kErrorCode_FFmpeg_Error,
    //     kErrorVideoCode_FFmpeg_Error,
    //     kErrorAudioCode_FFmpeg_Error,
    //     kErrorCode_Old_Frame,
    //     kErrorCode_NoEnoughData
    // } ErrorCode;

    // typedef enum LogLevel
    // {
    //     kLogLevel_None, // Not logging.
    //     kLogLevel_Core, // Only logging core module(without ffmpeg).
    //     kLogLevel_All   // Logging all, with ffmpeg.
    // } LogLevel;

    typedef struct WebDecoder
    {
        FLVParser parser;
    } WebDecoder;

    WebDecoder *decoder = NULL;
    LogLevel logLevel = kLogLevel_None;

    void simpleLog(const char *format, ...)
    {
        if (logLevel == kLogLevel_None)
        {
            return;
        }

        char szBuffer[1024] = {0};
        char szTime[32] = {0};
        char *p = NULL;
        int prefixLength = 0;
        const char *tag = "Core";
        struct tm tmTime;
        struct timeb tb;

        ftime(&tb);
        localtime_r(&tb.time, &tmTime);

        if (1)
        {
            int tmYear = tmTime.tm_year + 1900;
            int tmMon = tmTime.tm_mon + 1;
            int tmMday = tmTime.tm_mday;
            int tmHour = tmTime.tm_hour;
            int tmMin = tmTime.tm_min;
            int tmSec = tmTime.tm_sec;
            int tmMillisec = tb.millitm;
            sprintf(szTime, "%d-%d-%d %d:%d:%d.%d", tmYear, tmMon, tmMday, tmHour, tmMin, tmSec, tmMillisec);
        }

        prefixLength = sprintf(szBuffer, "[%s][%s][DT] ", szTime, tag);
        p = szBuffer + prefixLength;

        if (1)
        {
            va_list ap;
            va_start(ap, format);
            vsnprintf(p, 1024 - prefixLength, format, ap);
            va_end(ap);
        }

        printf("%s\n", szBuffer);
    }

    void ffmpegLogCallback(void *ptr, int level, const char *fmt, va_list vl)
    {
        static int printPrefix = 1;
        static int count = 0;
        static char prev[1024] = {0};
        char line[1024] = {0};
        static int is_atty;
        AVClass *avc = ptr ? *(AVClass **)ptr : NULL;
        if (level > AV_LOG_DEBUG)
        {
            return;
        }

        line[0] = 0;

        if (printPrefix && avc)
        {
            if (avc->parent_log_context_offset)
            {
                AVClass **parent = *(AVClass ***)(((uint8_t *)ptr) + avc->parent_log_context_offset);
                if (parent && *parent)
                {
                    snprintf(line, sizeof(line), "[%s @ %p] ", (*parent)->item_name(parent), parent);
                }
            }
            snprintf(line + strlen(line), sizeof(line) - strlen(line), "[%s @ %p] ", avc->item_name(ptr), ptr);
        }

        vsnprintf(line + strlen(line), sizeof(line) - strlen(line), fmt, vl);
        line[strlen(line) + 1] = 0;
        simpleLog("%s", line);
    }

    //////////////////////////////////Export methods////////////////////////////////////////
    ErrorCode initDecoder(int32_t fileSize, int32_t logLv, long videoParamCallback, long videoCallback,
                          long audioParamCallback, long audioCallback, long streamParamCallback, long videoDemuxeCallback, int32_t use_ffmpeg)
    {
        ErrorCode ret = kErrorCode_Success;
        do
        {
            // Log level.
            if (logLv == kLogLevel_All)
            {
                av_log_set_callback(ffmpegLogCallback);
            }

            if (decoder != NULL)
            {
                // std::cout << "initDecoder break--------------" << std::endl;
                break;
            }
            decoder = new WebDecoder;

            // std::cout << "initDecoder ........................." << std::endl;
            decoder->parser.Init((AudioParamCallback)audioParamCallback, (AudioCallback)audioCallback,
                                 (VideoParamCallback)videoParamCallback, (VideoCallback)videoCallback,
                                 (StreamParamCallback)streamParamCallback, (VideoDemuxeCallback)videoDemuxeCallback, use_ffmpeg);

        } while (0);

        simpleLog("Decoder initialized %d.", ret);
        return ret;
    }

    ErrorCode uninitDecoder()
    {
        // std::cout << "....................uninitDecoder" << std::endl;
        delete decoder;
        decoder = NULL;

        av_log_set_callback(NULL);

        // simpleLog("Decoder uninitialized.");
        return kErrorCode_Success;
    }

    void setAudioSpeed(float speed)
    {
        decoder->parser.SetAudioSpeed(speed);
        // std::cout << "setAudioSpeed-> " << speed << std::endl;
    }
    
    int tryDecode(unsigned char *buff, int size)
    {
        int ret = 0;
        do
        {
            if (decoder == NULL)
            {
                ret = -1;
                simpleLog("sendData -> decoder == NULL.");
                break;
            }

            if (buff == NULL || size == 0)
            {
                ret = -2;
                simpleLog("sendData -> buff == NULL || size == 0.");
                break;
            }
            // std::cout << "parse data........" << std::endl;
            decoder->parser.Parse(buff, size);
        } while (0);

        return ret;
    }

    void decodeVideo(unsigned char *buff, int size, uint32_t nTimeStamp)
    {
        do
        {
            // std::lock_guard<std::mutex> locker(mutex);
            if (decoder == NULL)
            {
                simpleLog("sendData -> decoder == NULL.");
                break;
            }

            if (buff == NULL || size == 0)
            {
                simpleLog("sendData -> buff == NULL || size == 0.");
                break;
            }
            // std::cout << "parse data........" << std::endl;
            decoder->parser.DecodeVideo(buff, size, nTimeStamp);
        } while (0);
    }

    void decodeAudio(unsigned char *buff, int size, uint32_t nTimeStamp)
    {
        // do
        // {
        //     // std::lock_guard<std::mutex> locker(mutex);
        //     if (decoder == NULL)
        //     {
        //         simpleLog("sendData -> decoder == NULL.");
        //         break;
        //     }

        //     if (buff == NULL || size == 0)
        //     {
        //         simpleLog("sendData -> buff == NULL || size == 0.");
        //         break;
        //     }
        //     // std::cout << "parse data........" << std::endl;
        //     decoder->parser.DecodeVideo(buff, size, nTimeStamp);
        // } while (0);
    }

    int main()
    {
        // simpleLog("Native loaded.");
        return 0;
    }

#ifdef __cplusplus
}
#endif
