import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import {
  ArrowLeft,
  Save,
  Plus,
  Users,
  Calendar,
  FileText,
  Camera,
  Upload,
  CheckCircle,
  AlertCircle,
  Target,
  Clock,
  Edit,
  Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { mockStakeholders, STAKEHOLDER_CATEGORIES } from '../utils/mockData'

export default function Meeting() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { meetings, currentMeeting, updateMeeting, addNoteToMeeting } = useApp()

  // Local state
  const [meeting, setMeeting] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedStakeholder, setSelectedStakeholder] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newActionItem, setNewActionItem] = useState('')
  const [digitalNotes, setDigitalNotes] = useState({
    topLeft: '',
    topRight: '',
    bottomLeft: '',
    bottomRight: ''
  })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Find the meeting by ID from the meetings array or use currentMeeting
    let foundMeeting = currentMeeting

    if (!foundMeeting && id) {
      foundMeeting = meetings.find(m => m.id === id)
    }

    if (!foundMeeting && id) {
      // If no meeting found, create a new one
      foundMeeting = {
        id: id,
        title: '',
        description: '',
        attendees: [],
        notes: [],
        actionItems: [],
        digitalNotes: {
          topLeft: '',
          topRight: '',
          bottomLeft: '',
          bottomRight: ''
        },
        status: 'upcoming',
        priority: 'medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      setIsEditing(true)
    }

    if (foundMeeting) {
      setMeeting(foundMeeting)
      setTitle(foundMeeting.title || '')
      setDescription(foundMeeting.description || '')
      setSelectedStakeholder(foundMeeting.selectedStakeholder || '')
      setDigitalNotes(foundMeeting.digitalNotes || {
        topLeft: '',
        topRight: '',
        bottomLeft: '',
        bottomRight: ''
      })
    }
  }, [id, meetings, currentMeeting])

  const handleSave = async () => {
    if (!meeting) return

    setIsSaving(true)

    try {
      const updatedMeeting = {
        ...meeting,
        title,
        description,
        selectedStakeholder,
        digitalNotes,
        updatedAt: new Date().toISOString()
      }

      await updateMeeting(updatedMeeting)
      setMeeting(updatedMeeting)
      setIsEditing(false)

      console.log('Meeting saved successfully')
    } catch (error) {
      console.error('Error saving meeting:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddNote = () => {
    if (!newNote.trim() || !meeting) return

    const note = {
      id: Date.now().toString(),
      content: newNote.trim(),
      timestamp: new Date().toISOString(),
      type: 'manual'
    }

    addNoteToMeeting(meeting.id, note)

    // Update local state
    setMeeting(prev => ({
      ...prev,
      notes: [...(prev.notes || []), note]
    }))

    setNewNote('')
  }

  const handleAddActionItem = () => {
    if (!newActionItem.trim() || !meeting) return

    const actionItem = {
      id: Date.now().toString(),
      text: newActionItem.trim(),
      completed: false,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
      priority: 'medium',
      assignee: selectedStakeholder
    }

    const updatedMeeting = {
      ...meeting,
      actionItems: [...(meeting.actionItems || []), actionItem]
    }

    setMeeting(updatedMeeting)
    updateMeeting(updatedMeeting)
    setNewActionItem('')
  }

  const handleDigitalNoteChange = (section, value) => {
    setDigitalNotes(prev => ({
      ...prev,
      [section]: value
    }))
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading meeting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft size={18} />
                Back to Home
              </button>

              <div className="border-l border-gray-300 pl-4">
                {isEditing ? (
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Meeting title..."
                    className="text-xl font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                  />
                ) : (
                  <h1 className="text-xl font-semibold text-gray-900">
                    {title || 'Untitled Meeting'}
                  </h1>
                )}
                <p className="text-sm text-gray-500">
                  {meeting.createdAt ? format(new Date(meeting.createdAt), 'MMM d, yyyy • h:mm a') : 'Just created'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    ) : (
                      <Save size={16} />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Edit size={16} />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Meeting Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Meeting Info */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Meeting Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  {isEditing ? (
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What's this meeting about?"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  ) : (
                    <p className="text-gray-700 min-h-[80px] p-3 bg-gray-50 rounded-lg">
                      {description || 'No description provided'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stakeholder</label>
                  {isEditing ? (
                    <select
                      value={selectedStakeholder}
                      onChange={(e) => setSelectedStakeholder(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select a stakeholder...</option>
                      {mockStakeholders.map(stakeholder => (
                        <option key={stakeholder.id} value={stakeholder.id}>
                          {stakeholder.name} - {stakeholder.role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-gray-700 p-3 bg-gray-50 rounded-lg">
                      {selectedStakeholder ?
                        mockStakeholders.find(s => s.id === selectedStakeholder)?.name || 'Unknown stakeholder'
                        : 'No stakeholder selected'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Digital Notes Grid */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Digital Notes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'topLeft', label: 'Key Discussion Points' },
                  { key: 'topRight', label: 'Decisions Made' },
                  { key: 'bottomLeft', label: 'Challenges & Blockers' },
                  { key: 'bottomRight', label: 'Action Items' }
                ].map(section => (
                  <div key={section.key} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">{section.label}</h3>
                    <textarea
                      value={digitalNotes[section.key]}
                      onChange={(e) => handleDigitalNoteChange(section.key, e.target.value)}
                      placeholder={`Add ${section.label.toLowerCase()}...`}
                      rows={4}
                      className="w-full px-3 py-2 border-0 resize-none focus:outline-none text-sm"
                      disabled={!isEditing}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Meeting Notes</h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
                  />
                  <button
                    onClick={handleAddNote}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="space-y-3">
                  {(meeting.notes || []).map(note => (
                    <div key={note.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <FileText size={16} className="text-gray-500 mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-gray-800">{note.content}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {note.timestamp ? format(new Date(note.timestamp), 'h:mm a') : 'Just now'}
                        </p>
                      </div>
                    </div>
                  ))}

                  {(!meeting.notes || meeting.notes.length === 0) && (
                    <p className="text-gray-500 text-center py-8 italic">No notes yet. Add your first note above.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Action Items & Status */}
          <div className="space-y-6">
            {/* Meeting Status */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    meeting.status === 'completed' ? 'bg-green-100 text-green-800' :
                    meeting.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {meeting.status || 'upcoming'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Priority</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    meeting.priority === 'high' ? 'bg-red-100 text-red-800' :
                    meeting.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {meeting.priority || 'medium'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Notes</span>
                  <span className="text-sm font-medium">{(meeting.notes || []).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Action Items</span>
                  <span className="text-sm font-medium">{(meeting.actionItems || []).length}</span>
                </div>
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Action Items</h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newActionItem}
                    onChange={(e) => setNewActionItem(e.target.value)}
                    placeholder="Add action item..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddActionItem()}
                  />
                  <button
                    onClick={handleAddActionItem}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Target size={16} />
                  </button>
                </div>

                <div className="space-y-3">
                  {(meeting.actionItems || []).map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        readOnly
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className={`text-sm ${item.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                          {item.text}
                        </p>
                        {item.dueDate && (
                          <p className="text-xs text-gray-500 mt-1">
                            Due: {format(new Date(item.dueDate), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {(!meeting.actionItems || meeting.actionItems.length === 0) && (
                    <p className="text-gray-500 text-center py-8 italic">No action items yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
                  <Camera className="text-gray-500" size={20} />
                  <div>
                    <p className="font-medium text-gray-900">Capture Notes</p>
                    <p className="text-sm text-gray-500">Take a photo of your notes</p>
                  </div>
                </button>

                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
                  <Upload className="text-gray-500" size={20} />
                  <div>
                    <p className="font-medium text-gray-900">Upload Files</p>
                    <p className="text-sm text-gray-500">Add meeting attachments</p>
                  </div>
                </button>

                <button
                  onClick={() => updateMeeting({ ...meeting, status: 'completed' })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <CheckCircle className="text-green-500" size={20} />
                  <div>
                    <p className="font-medium text-gray-900">Mark Complete</p>
                    <p className="text-sm text-gray-500">Finish this meeting</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">🎯 Full Meeting Interface Working!</h3>
          <p className="text-blue-700">
            Complete meeting management: edit details, take digital notes, add action items, and track progress.
          </p>
        </div>
      </main>
    </div>
  )
}