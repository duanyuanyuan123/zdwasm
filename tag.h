#ifndef FLVPLAYER_TAG_H_
#define FLVPLAYER_TAG_H_

#include <stdint.h>

extern uint64_t u64DateSize;

class Tag
{
public:
	struct TagHeader
	{
		int nType;
		int nDataSize;
		uint32_t nTimeStamp;
		uint32_t nTSEx;
		int nStreamID;

		uint32_t nTotalTS;

		TagHeader() : nType(0), nDataSize(0), nTimeStamp(0), nTSEx(0), nStreamID(0), nTotalTS(0) {}
		~TagHeader() {}
	};

public:
	Tag();
	virtual ~Tag();
	int32_t Init(uint8_t *pBuf, int nLeftLen);
	int32_t Append(uint8_t *pBuf, int nLeftLen);
	virtual void Parse() {};


	static unsigned int ShowU32(unsigned char *pBuf) { return (pBuf[0] << 24) | (pBuf[1] << 16) | (pBuf[2] << 8) | pBuf[3]; }
	static unsigned int ShowU24(unsigned char *pBuf) { return (pBuf[0] << 16) | (pBuf[1] << 8) | (pBuf[2]); }
	static unsigned int ShowU16(unsigned char *pBuf) { return (pBuf[0] << 8) | (pBuf[1]); }
	static unsigned int ShowU8(unsigned char *pBuf) { return (pBuf[0]); }
	static void WriteU64(uint64_t & x, int length, int value)
	{
		uint64_t mask = 0xFFFFFFFFFFFFFFFF >> (64 - length);
		x = (x << length) | ((uint64_t)value & mask);
	}
	static unsigned int WriteU32(unsigned int n)
	{
		unsigned int nn = 0;
		unsigned char *p = (unsigned char *)&n;
		unsigned char *pp = (unsigned char *)&nn;
		pp[0] = p[3];
		pp[1] = p[2];
		pp[2] = p[1];
		pp[3] = p[0];
		return nn;
	}

	TagHeader _header;
	uint8_t *_pTagData;
	uint8_t *_pMedia;
	int32_t _nMediaLen;
	int32_t _nMediaSize;
	int32_t _nNeedDataLen;
	int32_t _TagDataSize;

};
#endif
