import { CheckCircle2, Circle } from 'lucide-react'
import { getPasswordRequirements } from './passwordValidation'

export default function PasswordRequirements({ password, confirmation }) {
  return (
    <ul aria-label="Persyaratan kata sandi" className="password-requirements">
      {getPasswordRequirements(password, confirmation).map((requirement) => (
        <li className={requirement.valid ? 'is-valid' : ''} key={requirement.id}>
          {requirement.valid
            ? <CheckCircle2 aria-hidden="true" size={15} />
            : <Circle aria-hidden="true" size={15} />}
          <span>{requirement.label}</span>
        </li>
      ))}
    </ul>
  )
}
