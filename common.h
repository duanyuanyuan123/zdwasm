#ifndef FLV_PARSE_COMMOM_H_
#define FLV_PARSE_COMMOM_H_

typedef enum ErrorCode
{
	kErrorCode_Success = 0,
	kErrorCode_Invalid_Param,
	kErrorCode_Invalid_State,
	kErrorCode_Invalid_Data,
	kErrorCode_Invalid_Format,
	kErrorCode_NULL_Pointer,
	kErrorCode_Open_File_Error,
	kErrorCode_Eof,
	kErrorCode_FFmpeg_Error,
	kErrorVideoCode_FFmpeg_Error,
	kErrorAudioCode_FFmpeg_Error,
	kErrorCode_NoEnoughData,
	kErrorCode_Old_Frame,
	kErrorCode_OpenH264_Error

} ErrorCode;

typedef enum LogLevel
{
	kLogLevel_None, // Not logging.
	kLogLevel_Core, // Only logging core module(without ffmpeg).
	kLogLevel_All	// Logging all, with ffmpeg.
} LogLevel;

#ifdef __cplusplus
extern "C"
{
#endif
#include "libavformat/avformat.h"
#include "libavcodec/avcodec.h"
	void simpleLog(const char *format, ...);
#ifdef __cplusplus
}
#endif

struct AVCodecContextDeleter
{
	void operator()(AVCodecContext *ptr) const { avcodec_free_context(&ptr); }
};

struct AVFrameDeleter
{
	void operator()(AVFrame *ptr) const { av_frame_free(&ptr); }
};

#endif
