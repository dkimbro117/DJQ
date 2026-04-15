import { useState } from 'react'
import GuestPage from './pages/GuestPage'
import DJPage from './pages/DJPage'

function App() {
  const [currentPage, setCurrentPage] = useState('guest')

  if (currentPage === 'dj') {
    return <DJPage navigateTo={setCurrentPage} />
  }

  return <GuestPage navigateTo={setCurrentPage} />
}

export default App
