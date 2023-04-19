
#include "tag.h"
#include "aac_decoder.h"

#include <iostream>

const int kInitialPcmBufferSize = 128 * 1024;

AACDecoder::AACDecoder()
	: _av_codec_paramters(nullptr),
	  _pcm_buffer(nullptr),
	  _cur_pcm_buffer_size(0),
	  _initialized(false),
	  _audio_callback(nullptr),
	  _audio_param_callback(nullptr),
	  _sample_fmt(-1),
	  _channels(0),
	  _sample_rate(0),
	  _stream(nullptr),
	  _speed(1.0),
	  _out_sample_fmt(AVSampleFormat::AV_SAMPLE_FMT_S16P)
{
	_pcm_float_buffer = nullptr;
	_pcm_int16_buffer = nullptr;
	_pcm_buffer = nullptr;
}

void AACDecoder::SetAudioCallback(AudioParamCallback audio_param_callback, AudioCallback audio_callback)
{
	// std::lock_guard<std::mutex> locker(_mutex_callback);
	_audio_param_callback = audio_param_callback;
	_audio_callback = audio_callback;
}

void AACDecoder::SetSpeed(float speed)
{
	_speed = speed;
	if (_stream)
	{
		sonicSetSpeed(_stream, speed);
	}

	// std::cout << "Set speed up factor: " << _speed << " means " << _speed << "X faster" << std::endl;
}

int AACDecoder::Init()
{
#ifdef RAM_DUMP
	_debug_dump_f.open("D:\\aacDump\\raw.pcm", std::ios_base::out | std::ios_base::binary);
#endif // RAM_DUMP

	if (_initialized)
	{
		return 0;
	}

	int ret = 0;
	do
	{
		// avcodec_register_all();
		AVDictionary *opts = NULL;
		_av_codec_context.reset(avcodec_alloc_context3(nullptr));
		const AVCodec *codec = avcodec_find_decoder(AV_CODEC_ID_AAC);
		if (!codec)
		{
			// simpleLog("Failed to find %s codec %d.", av_get_media_type_string(type), st->codecpar->codec_id);
			ret = AVERROR(EINVAL);
			break;
		}

		_av_codec_paramters = avcodec_parameters_alloc();
		_av_codec_paramters->codec_type = AVMEDIA_TYPE_AUDIO;
		//_av_codec_paramters->sample_rate = sample_rate;
		//_av_codec_paramters->channels = channels;
		//_av_codec_paramters->bit_rate = bit;
		if ((ret = avcodec_parameters_to_context(_av_codec_context.get(), _av_codec_paramters)) != 0)
		{
			// simpleLog("Failed to copy %s codec parameters to decoder context.", av_get_media_type_string(type));
			break;
		}

		av_dict_set(&opts, "refcounted_frames", "0", 0);

		if ((ret = avcodec_open2(_av_codec_context.get(), codec, NULL)) != 0)
		{
			// simpleLog("Failed to open %s codec.", av_get_media_type_string(type));
			break;
		}

		_av_pkt = av_packet_alloc();
		_av_frame.reset(av_frame_alloc());

		// std::cout << "AACDecoder::Init" << std::endl;
		_initialized = true;
	} while (0);

	return 0;
}

void AACDecoder::Uninit()
{
	do
	{
		_av_codec_context.reset();
		_av_frame.reset();
		av_packet_free(&_av_pkt);
		avcodec_parameters_free(&_av_codec_paramters);
		// std::cout << "AACDecoder::Uninit free pcm buffer" << std::endl;
		if (_pcm_buffer)
		{
			delete _pcm_buffer;
			_pcm_buffer = nullptr;
		}
		// std::cout << "AACDecoder::Uninit" << std::endl;
		_audio_callback = nullptr;
		_audio_param_callback = nullptr;
		_initialized = false;
#ifdef RAM_DUMP
		_debug_dump_f.close();
#endif // RAM_DUMP

	} while (0);
}

void AACDecoder::InitSonic()
{
	float speed = 1.0f;
	float pitch = 1.0f;
	float rate = 1.0f;
	float volume = 1.0f;
	int outputSampleRate = 0; /* Means use the input file sample rate. */
	int emulateChordPitch = 0;
	int quality = 0;
	_stream = sonicCreateStream(_sample_rate, _channels);
	sonicSetSpeed(_stream, speed);
	sonicSetPitch(_stream, pitch);
	sonicSetRate(_stream, rate);
	sonicSetVolume(_stream, volume);
	sonicSetChordPitch(_stream, emulateChordPitch);
	sonicSetQuality(_stream, quality);
}

void AACDecoder::Float2Int16Data(int32_t channels, int32_t samples)
{
	float *buffer = (float *)_pcm_buffer;
	int r;
	for (size_t i = 0; i < samples * channels; i++)
	{
		float x = buffer[i];
		float c;
		c = ((x < -1) ? -1 : ((x > 1) ? 1 : x));
		c = c + 1;
		r = (int)(c * 32767.5f);
		r = r - 32768;
		_pcm_int16_buffer[i] = (short)r;
	}
}

const float *AACDecoder::Int162FloatData(int32_t samples, int32_t channels)
{
	int16_t *buffer = (int16_t *)_pcm_buffer;
	int16_t offset = 0;
	for (size_t channel = 0; channel < channels; channel++)
	{
		/* code */
		offset = channel;
		for (size_t i = 0; i < samples; i++)
		{
			/* code */
			_pcm_float_buffer[i + channel * samples] = buffer[offset] * 0.000030517578125f;
			offset += channels;
		}
		
	}
	return _pcm_float_buffer;
}

ErrorCode AACDecoder::Decode(uint8_t *data, int32_t len, uint32_t ts)
{
	if (data == nullptr || len == 0)
	{
		return kErrorCode_Success;
	}
	int decodedLen = 0;
	ErrorCode ret = kErrorCode_Success;

	// AVPacket packet;
	// av_init_packet(&packet);
	//_av_pkt = av_packet_alloc();
	_av_pkt->data = data;
	_av_pkt->size = len;

	do
	{
		// if (packet.stream_index == decoder->audioStreamIdx)
		// {
		//     simpleLog("packet is audio, decode audio ........");
		// }
		ret = DecodePacket(_av_pkt, &decodedLen, ts);
		if (ret != kErrorCode_Success)
		{
			break;
		}

		if (decodedLen <= 0)
		{
			//	simpleLog("decodedLen <= 0");
			break;
		}

		_av_pkt->data += decodedLen;
		_av_pkt->size -= decodedLen;
	} while (_av_pkt->size > 0);

	return ret;
}

ErrorCode AACDecoder::DecodePacket(AVPacket *pkt, int *decodedLen, uint32_t ts)
{
	int ret = 0;

	if (pkt == NULL || decodedLen == NULL)
	{
		// simpleLog("decodePacket invalid param.");
		return kErrorCode_Invalid_Param;
	}

	*decodedLen = 0;

	ret = avcodec_send_packet(_av_codec_context.get(), pkt);
	if (ret < 0)
	{
		// simpleLog("Error sending a packet for decoding %d.", ret);
		return kErrorCode_FFmpeg_Error;
	}

	while (ret >= 0)
	{
		ret = avcodec_receive_frame(_av_codec_context.get(), _av_frame.get());
		// simpleLog("avcodec_receive_frame -> ret = %d", ret);
		if (ret == AVERROR(EAGAIN))
		{
			av_frame_unref(_av_frame.get());
			return kErrorCode_Success;
		}
		else if (ret == AVERROR_EOF)
		{
			av_frame_unref(_av_frame.get());
			return kErrorCode_Eof;
		}
		else if (ret < 0)
		{
			av_frame_unref(_av_frame.get());
			// simpleLog("Error during decoding %d.", ret);
			return kErrorCode_FFmpeg_Error;
		}
		else
		{
			if (_sample_fmt != _av_frame->format || _channels != _av_frame->channels || _sample_rate != _av_frame->sample_rate)
			{
				_sample_fmt = _av_frame->format;
				_sample_rate = _av_frame->sample_rate;
				_channels = _av_frame->channels;
				// simpleLog("sample format: %d, sample rate: %d, channels: %d.", _sample_fmt, _sample_rate, _channels);
				// std::cout << "sample format: " << _sample_fmt << ", sample rate: " << _sample_rate << ", channels: " << _channels << std::endl;
				// std::lock_guard<std::mutex> locker(_mutex_callback);

				if (_audio_param_callback)
				{
					_audio_param_callback(_sample_fmt, _channels, _sample_rate);
				}
				InitSonic();
			}

			int r = ProcessDecodedAudioFrame(_av_frame.get(), ts);
			av_frame_unref(_av_frame.get());
			if (r == kErrorCode_Old_Frame)
			{
				return (ErrorCode)r;
			}
		}
	}

	*decodedLen = pkt->size;
	return kErrorCode_Success;
}

ErrorCode AACDecoder::ProcessDecodedAudioFrame(AVFrame *frame, uint32_t ts)
{
	ErrorCode ret = kErrorCode_Success;
	int sampleSize = 0;
	int audioDataSize = 0;
	int targetSize = 0;
	int offset = 0;
	int i = 0;
	int ch = 0;
	do
	{
		// simpleLog("processDecodedAudioFrame.......");
		if (frame == NULL)
		{
			ret = kErrorCode_Invalid_Param;
			// simpleLog("kErrorCode_Invalid_Param.......");
			break;
		}

		sampleSize = av_get_bytes_per_sample(_av_codec_context->sample_fmt);
		if (sampleSize < 0)
		{
			// simpleLog("Failed to calculate data size.");
			ret = kErrorCode_Invalid_Data;
			break;
		}

		if (_pcm_buffer == NULL)
		{
			_pcm_buffer = new uint8_t[kInitialPcmBufferSize];
			_pcm_int16_buffer = new int16_t[kInitialPcmBufferSize];
			_pcm_float_buffer = new float[kInitialPcmBufferSize];
			_cur_pcm_buffer_size = kInitialPcmBufferSize;
			// simpleLog("Initial PCM buffer size %d.", decoder->currentPcmBufferSize);
		}

		audioDataSize = frame->nb_samples * _av_codec_context->channels * sampleSize;
		if (_cur_pcm_buffer_size < audioDataSize)
		{
			targetSize = RoundUp(audioDataSize, 4);
			// simpleLog("Current PCM buffer size %d not sufficient for data size %d, round up to target %d.",
			//_cur_pcm_buffer_size,
			//	audioDataSize,
			//	targetSize);
			// std::cout << "AACDecoder::ProcessDecodedAudioFrame, malloc memory, size : " << _cur_pcm_buffer_size << std::endl;
			_cur_pcm_buffer_size = targetSize;
			delete _pcm_buffer;
			delete _pcm_int16_buffer;
			delete _pcm_float_buffer;
			_pcm_buffer = new uint8_t[_cur_pcm_buffer_size];
			_pcm_int16_buffer = new int16_t[_cur_pcm_buffer_size];
			_pcm_float_buffer = new float[_cur_pcm_buffer_size];
		}

		for (i = 0; i < frame->nb_samples; i++)
		{
			for (ch = 0; ch < _av_codec_context->channels; ch++)
			{
				memcpy(_pcm_buffer + offset, frame->data[ch] + sampleSize * i, sampleSize);
				offset += sampleSize;
			}
		}

		// timestamp = (double)frame->pts * av_q2d(_av_codec_context->time_base);

		// 		if (decoder->accurateSeek && timestamp < decoder->beginTimeOffset)
		// 		{
		// 			simpleLog("audio timestamp %lf < %lf", timestamp, decoder->beginTimeOffset);
		// 			ret = kErrorCode_Old_Frame;
		// 			break;
		// 		}

		// std::lock_guard<std::mutex> locker(_mutex_callback);
		int32_t samplesWritten = audioDataSize;
		if (_stream)
		{
			switch (frame->format)
			{
			case AVSampleFormat::AV_SAMPLE_FMT_U8:
				// encoding = "8bitInt";
				break;
			case AVSampleFormat::AV_SAMPLE_FMT_S16:
			{
				// encoding = "16bitInt";

				sonicWriteShortToStream(_stream, (short *)_pcm_buffer, frame->nb_samples);
				samplesWritten = sonicReadShortFromStream(_stream, (short *)_pcm_buffer,
														  frame->nb_samples);
				samplesWritten = samplesWritten * _av_codec_context->channels * sizeof(short);
			}
			break;
			case AVSampleFormat::AV_SAMPLE_FMT_S32:
				// encoding = "32bitInt";
				break;
			case AVSampleFormat::AV_SAMPLE_FMT_FLT:
			{
				break;
			}
			case AVSampleFormat::AV_SAMPLE_FMT_FLTP:
			{ // encoding = "32bitFloat";

				Float2Int16Data(_av_codec_context->channels, frame->nb_samples);
				sonicWriteShortToStream(_stream, _pcm_int16_buffer, frame->nb_samples);
				samplesWritten = sonicReadShortFromStream(_stream, (short *)_pcm_buffer,
														  frame->nb_samples);
				Int162FloatData(samplesWritten, _av_codec_context->channels);
				samplesWritten = samplesWritten * _av_codec_context->channels * sizeof(float);
				break;
			}

			default:
				break;
				//		std::cout << "Unsupported audio sampleFmt " << _sample_fmt << "!" << std::endl;
			}
		}

		if (_audio_callback != NULL)
		{
			_audio_callback((uint8_t*)_pcm_float_buffer, samplesWritten, (double)(ts * 1.0 / 1000), u64DateSize);
			// simpleLog("audioCallback is called.......");
		}
		else
		{
			// std::cout << "Audio timestamp : " << timestamp << std::endl;
#ifdef RAM_DUMP
			_debug_dump_f.write((char *)_pcm_buffer, audioDataSize);
#endif // RAM_DUMP

			// simpleLog("decoder->audioCallback is NULL.");
		}

	} while (0);
	return ret;
}

int AACDecoder::RoundUp(int numToRound, int multiple)
{
	return (numToRound + multiple - 1) & -multiple;
}
