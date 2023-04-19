#ifndef FLVPLAYER_AUDIOTAG_H_
#define FLVPLAYER_AUDIOTAG_H_

#include "tag.h"

#include "aac_decoder.h"

class AudioTag : public Tag
{
public:
	AudioTag();
	virtual ~AudioTag();

	int _nSoundFormat;
	int _nSoundRate;
	int _nSoundSize;
	int _nSoundType;

	// aac
	static int _aacProfile;
	static int _sampleRateIndex;
	static int _channelConfig;

	virtual void Parse();

	void SetAudioCallback(AudioParamCallback audio_param_callback, AudioCallback audio_callback);
	int ParseAACTag();
	int ParseAudioSpecificConfig(unsigned char *pTagData);
	int ParseRawAAC(unsigned char *pTagData);

	// void Decode(unit8_t *buff, int size, uint32_t nTimeStamp);

	void SetSpeed(float speed);

	AACDecoder _aac_decoder;
};
#endif
