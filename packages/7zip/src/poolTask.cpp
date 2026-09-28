#include "poolTask.h"

#include <utility>

namespace sevenzip {

PoolTask::PoolTask(Napi::Env env, const char* name, std::function<void()> run, std::function<void()> abandon)
    : Napi::AsyncWorker(env, name), run_(std::move(run)), abandon_(std::move(abandon)) {}

void PoolTask::Queue(Napi::Env env, const char* name, std::function<void()> run, std::function<void()> abandon) {
    auto* const task = new PoolTask(env, name, std::move(run), std::move(abandon));
    try {
        task->Napi::AsyncWorker::Queue();
    } catch (...) {
        // The destructor runs `abandon`, since `run` never will
        delete task;
        throw;
    }
}

PoolTask::~PoolTask() {
    if (abandon_) {
        abandon_();
    }
}

void PoolTask::Execute() {
    // Moved out first so that both callbacks' captures, which may hold the last
    // reference to an open archive, are destroyed here on the pool thread rather
    // than with this object on the event loop thread
    std::function<void()> const run = std::move(run_);
    std::function<void()> const abandon = std::move(abandon_);
    run_ = nullptr;
    abandon_ = nullptr;
    run();
}

}  // namespace sevenzip
