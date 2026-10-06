#pragma once

#include "reader.h"

/** Source implemented alongside track extraction. */
class TrackSource;

/** A pull reader over a TrackSource */
class TrackReader : public ReaderBase<TrackReader, TrackSource> {
   public:
    /** Define the JavaScript class, with its read() and close() methods */
    static Napi::Function GetClass(Napi::Env env);

    /**
     * new TrackReader(inputFilename, mode, trackIndex): throws to JavaScript for bad arguments; the
     * track is opened by the first read(), which rejects with a RangeError for a track index the
     * CHD doesn't have
     */
    explicit TrackReader(const Napi::CallbackInfo& info);
};

/** Resolves header information for a CHD on the thread pool. */
Napi::Value Info(const Napi::CallbackInfo& info);

/** Resolves track descriptors and TOC text on the thread pool. */
Napi::Value ListTracks(const Napi::CallbackInfo& info);
