import { useEffect, useState } from 'react'
import { Modal } from 'antd'
import { Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { issueParticipantCode, listParticipantCodes, revokeParticipantCode, type ParticipantCode } from '../api/experiments'

export function ParticipantCodes({ experimentId, experimentCode }: { experimentId: string; experimentCode: string }) {
	const [codes, setCodes] = useState<ParticipantCode[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	useEffect(() => {
		let active = true
		void listParticipantCodes(experimentId)
			.then((items) => { if (active) setCodes(items) })
			.catch(() => { if (active) setMessage('Could not load codes. Reopen this panel to retry.') })
		return () => { active = false }
	}, [experimentId])

	const issue = async () => {
		setBusy(true)
		setMessage('')
		try {
			const record = await issueParticipantCode(experimentId)
			setCodes((current) => [record, ...(current ?? [])])
			setMessage('Participant code created.')
		} catch {
			setMessage('Could not create the code. Please retry.')
		} finally {
			setBusy(false)
		}
	}

	const revoke = async (code: string) => {
		setBusy(true)
		setMessage('')
		try {
			await revokeParticipantCode(experimentId, code)
			setCodes((current) => current?.map((record) => record.code === code ? { ...record, revoked: true } : record) ?? [])
			setMessage('Participant code revoked.')
		} catch {
			setMessage('Could not revoke the code. Please retry.')
		} finally {
			setBusy(false)
		}
	}

	return <div className="study-access-panel">
        <p className="access-intro">Use a different participant code for each person.</p>
        <div className="access-experiment-code"><span>Experiment code</span><strong>{experimentCode}</strong></div>
        <div className="access-policy-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <div><strong>How access works</strong>
                <p>After you generate the first code, new participants must use one of the issued codes.</p>
                <p>Existing unfinished sessions can still resume with their original code.</p>
            </div>
        </div>
        <div className="access-code-actions">
            <h3>Issued codes{codes && <span>{codes.length}</span>}</h3>
            <button type="button" className="primary-button" disabled={!codes || busy} onClick={() => void issue()}><Plus size={15} aria-hidden="true" />{busy ? 'Please wait…' : 'Generate participant code'}</button>
        </div>
        {!codes && !message && <p role="status" className="access-message">Loading participant codes…</p>}
        {codes?.length === 0 && <div className="access-code-empty"><UsersRound size={23} aria-hidden="true" /><strong>No participant codes issued yet.</strong><p>Generate a code above, then share it with one participant.</p></div>}
        {codes && codes.length > 0 && <ul className="access-code-list">
            {codes.map(({ code, revoked }) => <li key={code}>
                <div className="access-issued-code"><code>{code}</code><span className={revoked ? 'is-revoked' : ''}>{revoked ? 'Revoked' : 'Active'}</span></div>
                {!revoked && <button type="button" className="secondary-button"
                    disabled={busy} onClick={() => Modal.confirm({
                        title: 'Revoke this participant code?',
                        content: 'This ends access for this code. Saved responses are preserved.',
                        onOk: () => revoke(code),
                    })}>Revoke</button>}
            </li>)}
        </ul>}
        {message && <p role="status" className="access-message">{message}</p>}
    </div>
}
