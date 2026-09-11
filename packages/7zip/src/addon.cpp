#include "addon.h"

#include <memory>

namespace sevenzip {
namespace {
/**
 * Cancels and drains workers before runtime destruction. Only teardown waits;
 * nonblocking notifications let workers finish without JavaScript delivery.
 */
void DrainOnCleanup(void* arg) {
    const std::unique_ptr<std::shared_ptr<JobRegistry>> registry(static_cast<std::shared_ptr<JobRegistry>*>(arg));
    (*registry)->DrainAndWait();
}
}  // namespace

/** Creates per-environment state and a runtime-independent worker cleanup hook. */
void InitAddonData(Napi::Env env) {
    auto data = std::make_unique<AddonData>();
    data->registry = std::make_shared<JobRegistry>();
    auto cleanup = std::make_unique<std::shared_ptr<JobRegistry>>(data->registry);
    env.SetInstanceData(data.get());
    if (env.IsExceptionPending()) return;
    // NOLINTNEXTLINE(bugprone-unused-return-value): instance data now owns the allocation.
    data.release();
    if (napi_add_env_cleanup_hook(env, DrainOnCleanup, cleanup.get()) != napi_ok) {
        Napi::Error::New(env, "failed to install the 7-Zip addon's cleanup hook").ThrowAsJavaScriptException();
        return;
    }
    // NOLINTNEXTLINE(bugprone-unused-return-value): the cleanup hook now owns the allocation.
    cleanup.release();
}

/** Retrieves shared registry ownership independently of instance-data lifetime. */
std::shared_ptr<JobRegistry> Registry(Napi::Env env) {
    auto* data = env.GetInstanceData<AddonData>();
    return data == nullptr ? nullptr : data->registry;
}
}  // namespace sevenzip
