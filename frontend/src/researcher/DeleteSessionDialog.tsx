import { useState } from 'react'
import { Modal, Alert } from 'antd'
import { deleteParticipantSession } from '../api/participant'

export function DeleteSessionDialog({ session, onCancel, onDeleted }: {
    session: { id: string; participantCode: string; experimentCode: string } | null
    onCancel: () => void
    onDeleted: (id: string) => void
}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const remove = async () => {
        if (!session || busy) return
        setBusy(true); setError('')
        try {
            await deleteParticipantSession(session.id)
            onDeleted(session.id)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not delete this record. Please retry.')
        } finally { setBusy(false) }
    }
    return <Modal open={Boolean(session)} title="Delete participant record?" centered
        okText="Delete this record" okButtonProps={{ danger: true }} confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy}
        onCancel={() => { if (!busy) { setError(''); onCancel() } }} onOk={() => void remove()}>
        <p><strong>{session?.participantCode}</strong> · {session?.experimentCode}</p>
        <p>This permanently deletes this session’s answers, event history, consent, recordings and linked AI conversation. Other participant records and the experiment design are kept.</p>
        {error && <Alert type="error" title={error} showIcon />}
    </Modal>
}
