#pragma once

#include <napi.h>

#include <functional>

namespace sevenzip {

/**
 * Runs one task on the libuv thread pool, as Node.js runs its own fs calls, and settles nothing.
 *
 * The task reports its outcome through its own channels. `abandon` runs instead,
 * on the event loop thread, only if the pool never runs the task, so that
 * whatever the task would have released is released anyway. Both callbacks must
 * not throw.
 */
class PoolTask : public Napi::AsyncWorker {
   public:
    /** Queues `run`, or runs `abandon` and throws when the task cannot be queued. */
    static void Queue(Napi::Env env, const char* name, std::function<void()> run, std::function<void()> abandon);

    /** Runs `abandon` if `run` never ran. */
    ~PoolTask() override;

    /** A queued task is owned by the runtime and cannot be copied. */
    PoolTask(const PoolTask&) = delete;

    /** A queued task is owned by the runtime and cannot be copy-assigned. */
    PoolTask& operator=(const PoolTask&) = delete;

    /** A queued task is owned by the runtime and cannot be moved. */
    PoolTask(PoolTask&&) = delete;

    /** A queued task is owned by the runtime and cannot be move-assigned. */
    PoolTask& operator=(PoolTask&&) = delete;

   protected:
    /** Runs the task on a pool thread, releasing both callbacks' captures there. */
    void Execute() override;

    /** Settles nothing; the task has already reported through its own channels. */
    void OnOK() override {}

    /** Settles nothing; Execute() never sets an error. */
    void OnError(const Napi::Error& /*error*/) override {}

   private:
    /** Stores the callbacks for Queue(). */
    PoolTask(Napi::Env env, const char* name, std::function<void()> run, std::function<void()> abandon);

    std::function<void()> run_;
    std::function<void()> abandon_;
};

}  // namespace sevenzip
