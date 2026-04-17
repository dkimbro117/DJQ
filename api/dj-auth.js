export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const configuredPassword = process.env.DJ_PASSWORD
  if (!configuredPassword) {
    return res.status(500).json({ error: 'DJ_PASSWORD is not configured' })
  }

  const { password } = req.body || {}
  const authorized = typeof password === 'string' && password === configuredPassword

  return res.status(200).json({ authorized })
}
