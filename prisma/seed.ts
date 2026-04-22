import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import { PrismaClient } from '../src/generated/prisma/client'
import { createDemoFinanceData } from '../src/server/modules/finance/application/demo/create-demo-finance-data'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const SALT_ROUNDS = 12

async function main() {
  console.log('Seeding database...')

  const existingUser = await prisma.user.findUnique({ where: { email: 'demo@finance.com' } })
  if (existingUser) {
    await prisma.user.delete({ where: { id: existingUser.id } })
    console.log('  Deleted existing demo user')
  }

  const password = await bcrypt.hash('demo1234', SALT_ROUNDS)
  const user = await prisma.user.create({
    data: {
      email: 'demo@finance.com',
      name: 'Victor',
      password,
    },
  })

  console.log(`  Created user: ${user.email}`)

  await createDemoFinanceData(user.id)

  console.log('  Created full demo workspace with credit-card installments')
  console.log('\nSeed complete!')
  console.log('  Login: demo@finance.com / demo1234')
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
