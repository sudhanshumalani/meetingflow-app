import React from 'react'

function App() {
  console.log('App component is rendering')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-blue-600 mb-4">🎉 MeetingFlow Debug</h1>
          <div className="space-y-4">
            <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
              <h2 className="text-lg font-semibold text-green-800">✅ Success!</h2>
              <p className="text-green-700">If you can see this styled content, then:</p>
              <ul className="list-disc list-inside mt-2 text-green-700">
                <li>React is working correctly</li>
                <li>Vite is serving the application</li>
                <li>Tailwind CSS is processing and loading</li>
                <li>The build system is functioning</li>
              </ul>
            </div>

            <div className="p-4 bg-blue-100 border border-blue-300 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-800">🔧 Next Steps</h2>
              <p className="text-blue-700">The issue is likely in the complex components. Let's restore the full app.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 bg-purple-100 rounded-lg text-center">
                <div className="text-2xl mb-2">📅</div>
                <div className="font-semibold">Meetings</div>
              </div>
              <div className="p-4 bg-orange-100 rounded-lg text-center">
                <div className="text-2xl mb-2">👥</div>
                <div className="font-semibold">Stakeholders</div>
              </div>
              <div className="p-4 bg-green-100 rounded-lg text-center">
                <div className="text-2xl mb-2">📊</div>
                <div className="font-semibold">Analytics</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App