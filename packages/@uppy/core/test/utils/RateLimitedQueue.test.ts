import { describe, expect, it, vi } from 'vitest'

import delay from '../../lib/utils/delay.js'
import { RateLimitedQueue } from '../../lib/utils/RateLimitedQueue.js'

describe('RateLimitedQueue', () => {
  it.each([undefined, 0, Infinity, 2])(
    'resumes empty and pending queues with limit %s',
    async (limit) => {
      const queue = new RateLimitedQueue(limit)
      queue.resume()
      const blocker = Promise.withResolvers<void>()
      const started: string[] = []
      const task = (label: string, priority = 0) =>
        queue.wrapPromiseFunction(
          async () => {
            started.push(label)
            await blocker.promise
            return label
          },
          { priority },
        )()

      const active = task('active')
      queue.pause()
      const low = task('low')
      const high = task('high', 1)
      const cancelled = queue.run(() => {
        started.push('cancelled')
        return () => {}
      })

      queue.resume()
      cancelled.abort()
      expect(started).toEqual(['active'])
      await Promise.resolve()
      expect(started).toEqual(
        limit === 2 ? ['active', 'high'] : ['active', 'high', 'low'],
      )

      blocker.resolve()
      await expect(Promise.all([active, low, high])).resolves.toEqual([
        'active',
        'low',
        'high',
      ])
      expect(started).toEqual(['active', 'high', 'low'])
    },
  )

  it('resumes an unlimited queue after a timed rate limit', async () => {
    vi.useFakeTimers()
    try {
      const queue = new RateLimitedQueue()
      queue.rateLimit(100)
      const task = vi.fn(async () => 'done')
      const result = queue.wrapPromiseFunction(task)()
      expect(task).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
      await expect(result).resolves.toBe('done')
      expect(queue.isPaused).toBe(false)
      expect(task).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  let pending = 0
  async function fn() {
    pending++
    await delay(15)
    pending--
  }

  it('should run at most N promises at the same time', async () => {
    const queue = new RateLimitedQueue(4)
    const fn2 = queue.wrapPromiseFunction(fn)

    const result = Promise.all([
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
    ])

    expect(pending).toBe(4)

    await delay(10)
    expect(pending).toBe(4)

    await result
    expect(pending).toBe(0)
  })

  it('should accept Infinity as limit', async () => {
    const queue = new RateLimitedQueue(Infinity)
    const fn2 = queue.wrapPromiseFunction(fn)

    const result = Promise.all([
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
    ])

    expect(pending).toBe(10)

    await result

    expect(pending).toBe(0)
  })

  it('should accept non-promise function in wrapPromiseFunction()', () => {
    const queue = new RateLimitedQueue(1)
    function syncFn() {
      return 1
    }
    const fn2 = queue.wrapPromiseFunction(syncFn)

    return Promise.all([
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
      fn2(),
    ])
  })
})
