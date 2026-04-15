import type { Metadata } from 'next'
import { RegisterForm } from './register-form'

export const metadata: Metadata = {
  title: 'Cadastro | Finance Controller',
}

export default function RegisterPage() {
  return <RegisterForm />
}
