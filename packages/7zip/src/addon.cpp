#include "addon.h"

#include <memory>
#include <thread>
#include <utility>

namespace sevenzip {

namespace {

// Runs when the environment is being torn down, on the thread doing the
// teardown. Everything still decoding has to be stopped and waited for before
// the environment goes away underneath it.
//
// The wait cannot happen inline: this runs on the JS thread, and blocking it
// while a producer is still unwinding stalls whatever that producer needs the
// loop for. napi_add_async_cleanup_hook suspends teardown until
// napi_remove_async_cleanup_hook() is called, possibly from another thread.
void DrainOnCleanup(napi_async_cleanup_hook_handle handle, void* arg) {
    std::shared_ptr<JobRegistry> registry;
    if (arg != nullptr) {
        registry = static_cast<AddonData*>(arg)->registry;
    }
    if (!registry) {
        napi_remove_async_cleanup_hook(handle);
        return;
    }

    try {
        // The registry keeps itself alive through this lambda's capture, so the
        // joiner remains valid no matter when the environment's instance data
        // is finalized relative to this hook.
        std::thread([handle, registry = std::move(registry)]() {
            registry->DrainAndWait();
            // Signals that teardown may continue. Nothing may touch `registry`
            // after this, since the environment is free to finish going away.
            napi_remove_async_cleanup_hook(handle);
        }).detach();
    } catch (...) {
        // The OS refused a thread while the process is shutting down.
        // Draining here blocks the loop, which the async hook was avoiding, but
        // the alternative is letting live threads outlive the environment: a
        // stall at exit beats a use-after-free at exit.
        static_cast<AddonData*>(arg)->registry->DrainAndWait();
        napi_remove_async_cleanup_hook(handle);
    }
}

}  // namespace

void InitAddonData(Napi::Env env) {
    auto* data = new AddonData();
    data->registry = std::make_shared<JobRegistry>();
    // N-API deletes this at environment teardown.
    env.SetInstanceData(data);

    napi_async_cleanup_hook_handle handle = nullptr;
    // Not fatal on its own -- the addon works, it just would not drain at
    // teardown -- but that is the condition this exists to prevent, so it is
    // reported rather than swallowed.
    if (napi_add_async_cleanup_hook(env, DrainOnCleanup, data, &handle) != napi_ok) {
        Napi::Error::New(env, "failed to install the 7-Zip addon's cleanup hook").ThrowAsJavaScriptException();
    }
}

std::shared_ptr<JobRegistry> Registry(Napi::Env env) {
    auto* data = env.GetInstanceData<AddonData>();
    return data == nullptr ? nullptr : data->registry;
}

}  // namespace sevenzip
