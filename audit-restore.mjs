import assert from 'node:assert/strict'

const modes = ['relative', 'local', 'utc', 'unix']
let sequences = 0
for (const start of modes) for (const restored of modes) {
  let disk = start
  let writeCount = 0
  const handlers = new Set()
  globalThis.window = {
    addEventListener: (type, handler) => {
      assert.equal(type, 'pageshow')
      handlers.add(handler)
    },
    removeEventListener: (type, handler) => {
      assert.equal(type, 'pageshow')
      handlers.delete(handler)
    },
    localStorage: {
      getItem: () => disk,
      setItem: (_, value) => { disk = value; writeCount++ },
    },
  }
  const store = await import(`../../apps/explorer/src/lib/time-format.ts?restore=${sequences}`)
  let notifications = 0
  const listener = () => { notifications++ }
  const stopFirst = store.subscribeTimeFormat(listener)
  const stopSecond = store.subscribeTimeFormat(listener)
  assert.equal(handlers.size, 1)
  assert.equal(store.getTimeFormat(), start)
  disk = restored
  for (const handler of handlers) handler({persisted: false})
  assert.equal(store.getTimeFormat(), start)
  for (const handler of handlers) handler({persisted: true})
  assert.equal(store.getTimeFormat(), restored)
  assert.equal(notifications, restored === start ? 0 : 2)
  assert.equal(writeCount, 0)
  stopFirst()
  stopFirst()
  assert.equal(handlers.size, 1)
  stopSecond()
  assert.equal(handlers.size, 0)
  disk = start
  const stopAgain = store.subscribeTimeFormat(listener)
  assert.equal(store.getTimeFormat(), start)
  assert.equal(handlers.size, 1)
  stopAgain()
  assert.equal(handlers.size, 0)
  assert.equal(writeCount, 0)
  delete globalThis.window
  assert.equal(store.getTimeFormat(), 'relative')
  const stopServer = store.subscribeTimeFormat(() => assert.fail('server listener'))
  stopServer()
  sequences++
}
console.log(`PASS: ${sequences} exhaustive initial/restored mode pairs, duplicate subscriptions, listener cleanup and SSR`)
