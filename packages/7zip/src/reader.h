#pragma once

#include <cstdint>
#include <memory>
#include <napi.h>

namespace sevenzip {

// Defined in reader.cpp: nothing outside that file drives the extraction
// thread, so its declaration does not belong in a header. EntryReader holds one
// by pointer, which is why its destructor is declared here and defined there,
// where Pump is complete.
class Pump;

// The JS-visible pull reader. Mirrors the audited lifecycle in
// packages/chdman/binding.cpp: reading_ rejects concurrent reads, closed_
// rejects reads after close, teardown is deferred until no worker is in flight,
// and Ref()/Unref() balance on both the resolve and reject paths.
class EntryReader : public Napi::ObjectWrap<EntryReader> {
   public:
    static Napi::Function GetClass(Napi::Env env);

    explicit EntryReader(const Napi::CallbackInfo& info);
    ~EntryReader() override;

    EntryReader(const EntryReader&) = delete;
    EntryReader& operator=(const EntryReader&) = delete;
    EntryReader(EntryReader&&) = delete;
    EntryReader& operator=(EntryReader&&) = delete;

    Napi::Value Read(const Napi::CallbackInfo& info);
    void Close(const Napi::CallbackInfo& info);

    // Worker thread. Never overlaps Teardown().
    size_t Produce(uint8_t* out, size_t maxBytes);

    // JS thread, after the worker has fully returned.
    void FinishRead();

    // JS thread. close() runs there too, and it cannot be preempted by a
    // worker's completion callback, so a read that finds this true was closed
    // while it was in flight.
    bool WasClosed() const noexcept { return closed_; }

   private:
    // The bodies of the entry points above. Each is called from inside exactly
    // one try/catch, because N-API is built here with NAPI_DISABLE_CPP_EXCEPTIONS
    // and an exception unwinding through V8's C ABI aborts the process.
    void Construct(const Napi::CallbackInfo& info);
    // Sets *settled once the deferred has been rejected or handed to a queued
    // worker, so Read()'s catch cannot settle it a second time.
    void StartRead(const Napi::CallbackInfo& info, const Napi::Promise::Deferred& deferred,
                   bool* settled);
    void Shutdown();

    void Teardown();

    std::unique_ptr<Pump> pump_;
    bool closed_ = false;
    bool reading_ = false;
};

}  // namespace sevenzip
