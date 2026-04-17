import { useState } from 'react'
import GuestPage from './pages/GuestPage'
import DJPage from './pages/DJPage'

function App() {
  const [currentPage, setCurrentPage] = useState('guest')

  if (currentPage === 'dj') {
    return (
      <div className="animate-fade">
        <DJPage navigateTo={setCurrentPage} />
      </div>
    )
  }

  return (
    <div className="animate-fade">
      <GuestPage navigateTo={setCurrentPage} />
    </div>
  )
}

export default App
