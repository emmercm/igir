#include "addon.h"

#include <uv.h>

#include <memory>
#include <thread>
#include <utility>

namespace sevenzip {

namespace {

/** Owns the registry and loop wakeup used while asynchronous environment cleanup is pending. */
struct CleanupState {
    std::shared_ptr<JobRegistry> registry{};
    uv_async_t signal{};
    napi_async_cleanup_hook_handle hook = nullptr;
};

/** Removes the completed cleanup hook and frees its state after libuv closes the wakeup handle. */
void CleanupClosed(uv_handle_t* handle) {
    auto* state = static_cast<CleanupState*>(handle->data);
    if (state->hook) {
        napi_remove_async_cleanup_hook(state->hook);
    }
    delete state;
}

/** Runs on the event loop after the drain thread finishes and begins cleanup-handle closure. */
void DrainFinished(uv_async_t* handle) {
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast): libuv documents this upcast for handle APIs.
    uv_close(reinterpret_cast<uv_handle_t*>(handle), CleanupClosed);
}

/**
 * Starts environment teardown without blocking the JavaScript thread.
 * Everything still decoding is cancelled and drained before the hook is
 * removed, preventing workers from outliving their N-API environment.
 *
 * Runs when the environment is being torn down, on the thread doing teardown.
//
// The wait cannot happen inline: this runs on the JS thread, and blocking it
// while a producer is still unwinding stalls whatever that producer needs the
// loop for. napi_add_async_cleanup_hook suspends teardown until
 * napi_remove_async_cleanup_hook() is called back on the event loop.
 */
void DrainOnCleanup(napi_async_cleanup_hook_handle /*handle*/, void* arg) {
    auto* state = static_cast<CleanupState*>(arg);
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast): libuv documents this upcast for handle APIs.
    uv_ref(reinterpret_cast<uv_handle_t*>(&state->signal));
    try {
        // CleanupState outlives the thread through its uv handle. Completion
        // must wake the loop; removing an N-API hook on this thread can leave
        // Node asleep waiting for cleanup even though draining has finished.
        std::thread([state]() {
            state->registry->DrainAndWait();
            uv_async_send(&state->signal);
        }).detach();
    } catch (...) {
        // The OS refused a thread while the process is shutting down.
        // Draining here blocks the loop, which the async hook was avoiding, but
        // the alternative is letting live threads outlive the environment: a
        // stall at exit beats a use-after-free at exit.
        state->registry->DrainAndWait();
        DrainFinished(&state->signal);
    }
}

}  // namespace

/** Creates per-environment state plus the loop signal used to finish asynchronous cleanup. */
void InitAddonData(Napi::Env env) {
    auto data = std::make_unique<AddonData>();
    data->registry = std::make_shared<JobRegistry>();
    // N-API deletes this at environment teardown
    env.SetInstanceData(data.get());
    if (env.IsExceptionPending()) {
        return;
    }
    auto* ownedData = data.release();
    auto cleanup = std::make_unique<CleanupState>();
    cleanup->registry = ownedData->registry;
    uv_loop_t* loop = nullptr;
    if (napi_get_uv_event_loop(env, &loop) != napi_ok || uv_async_init(loop, &cleanup->signal, DrainFinished) != 0) {
        Napi::Error::New(env, "failed to initialize the 7-Zip cleanup signal").ThrowAsJavaScriptException();
        return;
    }
    cleanup->signal.data = cleanup.get();
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast): libuv documents this upcast for handle APIs.
    uv_unref(reinterpret_cast<uv_handle_t*>(&cleanup->signal));
    auto* state = cleanup.release();  // freed only after uv_close completes
    if (napi_add_async_cleanup_hook(env, DrainOnCleanup, state, &state->hook) != napi_ok) {
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast): libuv documents this upcast for handle APIs.
        uv_close(reinterpret_cast<uv_handle_t*>(&state->signal), CleanupClosed);
        Napi::Error::New(env, "failed to install the 7-Zip addon's cleanup hook").ThrowAsJavaScriptException();
    }
}

/** Retrieves a shared registry reference so a worker can safely outlive the instance-data pointer. */
std::shared_ptr<JobRegistry> Registry(Napi::Env env) {
    auto* data = env.GetInstanceData<AddonData>();
    return data == nullptr ? nullptr : data->registry;
}

}  // namespace sevenzip
