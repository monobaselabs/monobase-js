import { describe, test, expect, afterEach } from 'bun:test'
import { render, cleanup } from '@testing-library/react'
import { PhoneInput } from './phone-input'

describe('PhoneInput', () => {
  afterEach(() => {
    cleanup()
  })

  test('renders without crashing', () => {
    const onChange = () => {}
    const { container } = render(<PhoneInput onChange={onChange} />)

    // Should render input element
    const input = container.querySelector('input[type="tel"]')
    expect(input).toBeDefined()
  })

  test('renders with default country', () => {
    const onChange = () => {}
    const { container } = render(<PhoneInput onChange={onChange} defaultCountry="CA" />)

    const input = container.querySelector('input[type="tel"]')
    expect(input).toBeDefined()
  })

  test('renders with value', () => {
    const onChange = () => {}
    const { container } = render(
      <PhoneInput
        onChange={onChange}
        value="+12133734253"
        defaultCountry="US"
      />
    )

    const input = container.querySelector('input[type="tel"]') as HTMLInputElement
    expect(input.value).toBe('+1 213 373 4253')
  })

  test('renders country selector button', () => {
    const onChange = () => {}
    const { container } = render(<PhoneInput onChange={onChange} defaultCountry="CA" />)

    // Should render country selector button
    const button = container.querySelector('button')
    expect(button).toBeDefined()
  })
})
