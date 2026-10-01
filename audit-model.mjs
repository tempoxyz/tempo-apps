import assert from 'node:assert/strict'

const modes = ['relative', 'local', 'utc', 'unix']
const key = 'tempo-explorer-time-format'
let operations = 0
for (let seed = 1; seed <= 100; seed++) {
  let randomState = seed
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
    return randomState
  }
  let expected = modes[seed % 4]
  const data = new Map([[key, expected], ['sentinel', 'unchanged']])
  let failWrite = false
  let writes = 0
  const events = new EventTarget()
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: {
    getItem: name => data.get(name) ?? null,
    setItem: (name, value) => {
      if (failWrite) throw Error('quota')
      writes++
      data.set(name, value)
    },
  } }
  let store = await import(`../../apps/explorer/src/lib/time-format.ts?audit=${seed}-0`)
  assert.equal(store.getTimeFormat(), expected)
  assert.equal(writes, 0)
  let observerCalls = 0
  let stop = store.subscribeTimeFormat(() => {
    observerCalls++
    assert.equal(store.getTimeFormat(), expected)
  })
  for (let index = 1; index <= 100; index++) {
    const action = random() % 6
    if (action === 0) {
      const oldCalls = observerCalls
      stop()
      stop()
      assert.equal(store.getTimeFormat(), expected)
      stop = store.subscribeTimeFormat(() => {
        observerCalls++
        assert.equal(store.getTimeFormat(), expected)
      })
      assert.equal(observerCalls, oldCalls)
    } else if (action === 1) {
      stop()
      expected = data.get(key)
      store = await import(`../../apps/explorer/src/lib/time-format.ts?audit=${seed}-${index}`)
      assert.equal(store.getTimeFormat(), expected)
      stop = store.subscribeTimeFormat(() => {
        observerCalls++
        assert.equal(store.getTimeFormat(), expected)
      })
    } else {
      failWrite = action === 2
      const previous = expected
      expected = modes[(modes.indexOf(expected) + 1) % 4]
      if (action === 3) {
        store.setTimeFormat(current => {
          assert.equal(current, previous)
          return expected
        })
      } else store.cycleTimeFormat()
      assert.equal(store.getTimeFormat(), expected)
      if (!failWrite) assert.equal(data.get(key), expected)
    }
    assert.equal(data.get('sentinel'), 'unchanged')
    assert.equal(store.getServerTimeFormat(), 'relative')
    operations++
  }
  stop()
  delete globalThis.window
  assert.equal(store.getTimeFormat(), 'relative')
  store.setTimeFormat('unix')
  assert.equal(store.getTimeFormat(), 'relative')
}
console.log(`PASS: ${operations} deterministic model operations across 100 seeds`)
