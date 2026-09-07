#pragma once

#include <napi.h>

#include <memory>

#include "jobRegistry.h"

namespace sevenzip {

// Per-environment addon state, and the teardown hook that drains it.
//
// This is the only place N-API and JobRegistry meet. The registry is held per
// environment rather than in a process-global, because `worker_threads` can
// load this addon into several environments in one process: a global would let
// one worker's teardown cancel another worker's live extractions.
struct AddonData {
    // Shared rather than owned outright. Each running job holds a reference of
    // its own, so a job can always unregister safely even if the environment's
    // instance data has already been finalized -- the relative order of that
    // finalizer and the cleanup hook is not something to depend on.
    std::shared_ptr<JobRegistry> registry;
};

// Creates this environment's AddonData and installs the async cleanup hook.
// Called once, from the addon's Init.
void InitAddonData(Napi::Env env);

// This environment's job registry. Never null once InitAddonData() has run.
std::shared_ptr<JobRegistry> Registry(Napi::Env env);

}  // namespace sevenzip
