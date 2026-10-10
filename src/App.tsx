import { useEffect, useState } from 'react'
import { loadHelvetica } from './text/helvetica'
import { Editor } from './ui/Editor'
import type { OpenFile } from './ui/open-file'
import { UploadScreen } from './ui/UploadScreen'

export function App() {
  const [file, setFile] = useState<OpenFile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void loadHelvetica().then(() => setReady(true))
  }, [])

  if (!ready) return null
  return file ? (
    <Editor
      key={file.id}
      file={file}
      onClose={() => {
        file.doc.destroy()
        setFile(null)
      }}
    />
  ) : (
    <UploadScreen onOpen={setFile} />
  )
}
