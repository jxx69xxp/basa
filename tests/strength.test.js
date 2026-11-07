import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strength } from '../src/lib/strength.js'

test('password strength', () => {
  assert.equal(strength('short'), 0)
  assert.equal(strength('abcdefgh'), 1)
  assert.equal(strength('abcdefgh1'), 2)
  assert.equal(strength('Abcdefgh1'), 3)
  assert.equal(strength('Abcdefghijk1'), 4)
})
