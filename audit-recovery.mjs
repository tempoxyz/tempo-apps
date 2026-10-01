import assert from 'node:assert/strict'

const events = new EventTarget()
let denyRead = true
const disk = 'utc'
globalThis.window = {
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  localStorage: {
    getItem: () => {
      if (denyRead) throw Error('read blocked')
      return disk
    },
    setItem: () => { throw Error('write blocked') },
  },
}
const store = await import('../../apps/explorer/src/lib/time-format.ts')
const stop = store.subscribeTimeFormat(() => {})
assert.equal(store.getTimeFormat(), 'relative')
store.cycleTimeFormat()
assert.equal(store.getTimeFormat(), 'local')
stop()
denyRead = false
const stopAgain = store.subscribeTimeFormat(() => {})
console.log({ expected: 'local', actual: store.getTimeFormat(), disk })
assert.equal(store.getTimeFormat(), 'local', 'failed-write choice must survive remount')
stopAgain()
