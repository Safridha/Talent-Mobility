import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordInput({ className = '', ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className={`password-field ${className}`.trim()}>
      <input {...inputProps} type={isVisible ? 'text' : 'password'} />
      <button
        aria-label={isVisible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
        type="button"
      >
        {isVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
      </button>
    </div>
  )
}
