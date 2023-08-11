import { initializeApp, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

import axios from 'axios'

const FIREBASE_CREDENTIALS_URL = process.env.FIREBASE_CREDENTIALS_URL

let database

async function startFirebase() {
  const res = await axios.get(FIREBASE_CREDENTIALS_URL)
  const serviceAccount = res.data

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://rnkng-2bc3e-default-rtdb.firebaseio.com'
  })

  database = getDatabase()
}

export { startFirebase, database }
