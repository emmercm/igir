#pragma once

#include <napi.h>

#include <memory>

#include "jobRegistry.h"

namespace sevenzip {

/**
 * Owns the job registry for one N-API environment until finalization.
 *
 * Keeping the registry per environment prevents teardown of one worker thread
 * from cancelling another worker's live extractions.
 */
struct AddonData {
    // Shared rather than owned outright, so that a job holding a reference can
    // still unregister after this environment's instance data is finalized.
    // The order of that finalizer against the cleanup hook is not something
    // to depend on.
    std::shared_ptr<JobRegistry> registry;
};

/** Creates this environment's AddonData and installs its asynchronous cleanup hook. */
void InitAddonData(Napi::Env env);

/** Returns this environment's job registry, or null after environment state has gone away. */
std::shared_ptr<JobRegistry> Registry(Napi::Env env);

}  // namespace sevenzip
