import { useEffect, useState } from 'react'
import { Modal } from 'antd'
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
		<p>Share experiment code <strong>{experimentCode}</strong> and one participant code per person.</p>
		<p>Issuing the first code restricts new entries to issued codes. Existing unfinished sessions can resume with their original code.</p>
		<button type="button" className="primary-button" disabled={!codes || busy} onClick={() => void issue()}>Generate participant code</button>
		{codes?.length === 0 && <p>No participant codes issued yet.</p>}
		{codes && codes.length > 0 && <ul>
			{codes.map(({ code, revoked }) => <li key={code}>
				<code>{code}</code>
				{revoked ? <span className="muted">Revoked</span> : <button type="button" className="secondary-button"
					disabled={busy} onClick={() => Modal.confirm({
						title: 'Revoke this participant code?',
						content: 'This ends access for this code. Saved responses are preserved.',
						onOk: () => revoke(code),
					})}>Revoke</button>}
			</li>)}
		</ul>}
		<p role="status">{message}</p>
	</div>
}
