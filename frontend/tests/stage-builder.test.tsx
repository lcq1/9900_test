import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { StageContentEditor } from "../src/researcher/StageContentEditor";
import { createStage, type Experiment, getPublishErrors } from "../src/types";

import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { Modal } from 'antd'
import { clear, setSession } from "../src/auth/sessionStore";
import { http } from '../src/api/http'

describe('stage content', () => {
	afterEach(cleanup)

	function Harness() {
		const [stage, setStage] = useState(() => createStage('single_choice'))
		return (
			<>
				<StageContentEditor stage={stage} onUpdateStage={setStage} />
				<output data-testid="stage">{JSON.stringify(stage)}</output>
			</>
		)
	}

	it('changes single choice to multiple choice without losing options', () => {
		render(<Harness />)
		fireEvent.change(screen.getByRole('combobox'), {
			target: { value: 'multiple_choice' },
		})
		const stage = JSON.parse(screen.getByTestId('stage').textContent!)
		expect(stage.type).toBe('multiple_choice')
		expect(
			stage.components.find(
				(c: { type: string }) => c.type === 'checkbox',
			).options,
		).toEqual(['Option A', 'Option B'])
	})

	it('retains rating, signature and attachment authoring controls', () => {
		render(<Harness />)
		for (const label of ['Rating', 'Signature', 'Attachment'])
			fireEvent.click(
				screen.getByRole('button', { name: label, exact: true }),
			)
		const stage = JSON.parse(screen.getByTestId('stage').textContent!)
		expect(stage.components.map((c: { type: string }) => c.type)).toEqual(
			expect.arrayContaining(['rating', 'signature', 'attachment']),
		)
	})
})

const api = vi.hoisted(() => ({
  experiments: [] as Experiment[],
  save: vi.fn(),
}));

vi.mock('antd', () => ({
	Alert: ({
		title,
		description,
	}: {
		title: string
		description?: import('react').ReactNode
	}) => (
		<div role="alert">
			{title}
			{description}
		</div>
	),
	Modal: { confirm: vi.fn(), success: vi.fn() },
}))

vi.mock('../src/participant/StageRenderer', () => ({
	ParticipantPreview: ({
		experiment,
		participantCode,
	}: {
		experiment: Experiment
		participantCode: string
	}) => (
		<div>
			Answer preview: {experiment.code} / {participantCode}
		</div>
	),
}))

vi.mock("../src/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/experiments")>()),
  useExperiments: () => ({
    experiments: api.experiments,
    loading: false,
    error: null,
    saveExperiment: api.save,
  }),
}));

function experiment(): Experiment {
  return {
    id: "publish-study",
    name: "Publish study",
    code: "EXP-PUBLISH",
    status: "Draft",
    created: "2026-10-27",
    fullScreen: false,
    stages: [createStage("consent"), createStage("short_answer")],
  };
}

function openEditor() {
	render(
		<MemoryRouter initialEntries={['/researcher/experiment/publish-study']}>
			<App />
		</MemoryRouter>,
	)
}

beforeEach(() => {
	vi.mocked(Modal.success).mockClear()
	api.experiments = [experiment()]
	api.save
		.mockReset()
		.mockImplementation(async (input: Experiment) => structuredClone(input))
	setSession({
		token: 'test-token',
		issuedAt: '2026-10-27',
		researcher: {
			id: 'researcher',
			name: 'Researcher',
			email: 'test@example.com',
			role: 'researcher',
			createdAt: '2026-10-27',
		},
	})
})

afterEach(() => {
  cleanup();
  clear();
});

describe("publish validation", () => {
  it("accepts consent plus a valid question", () => {
    expect(getPublishErrors(experiment())).toEqual([]);
  });
  it("rejects consent-only studies and closed experiments", () => {
    const draft = experiment();
    draft.stages.pop();
    expect(getPublishErrors(draft).join(" ")).toContain("2–20");
    draft.status = "Closed";
    expect(getPublishErrors(draft)).toContain(
      "Closed experiments cannot be published again.",
    );
  });
  it("rejects missing consent, blank choices and invalid timers", () => {
    const draft = experiment();
    draft.stages = [createStage("single_choice"), createStage("short_answer")];
    draft.stages[0].components[1].options = ["A", " "];
    draft.stages[1].countdownMinutes = 0;
    const errors = getPublishErrors(draft).join(" ");
    expect(errors).toContain("only consent stage");
    expect(errors).toContain("non-empty options");
    expect(errors).toContain("positive whole number");
  });
});

describe('researcher preview', () => {
	it('opens the selected experiment directly without access-code entry', async () => {
		api.experiments.unshift({
			...experiment(),
			id: 'other-study',
			code: 'OTHER',
		})
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Preview', exact: true }),
		)
		await screen.findByText(/Answer preview: EXP-PUBLISH \/ PREVIEW-/)
		expect(screen.queryByText('Enter your access codes')).toBeNull()
		expect(api.save).not.toHaveBeenCalled()
	})
	it('opens the workspace preview without asking for login codes', async () => {
		render(
			<MemoryRouter initialEntries={['/researcher/preview']}>
				<App />
			</MemoryRouter>,
		)
		await screen.findByText(/Answer preview: EXP-PUBLISH \/ PREVIEW-/)
	})
	it('does not fall back to a different experiment for an unknown id', async () => {
		render(
			<MemoryRouter
				initialEntries={['/researcher/preview?experiment=missing']}
			>
				<App />
			</MemoryRouter>,
		)
		await screen.findByText('Experiment not found.')
		expect(screen.queryByText(/Answer preview:/)).toBeNull()
	})
})

describe('editor publishing', () => {
	it('retains automatic saving of edits', async () => {
		openEditor()
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'Autosaved study' },
		})
		await waitFor(
			() =>
				expect(api.save).toHaveBeenCalledWith(
					expect.objectContaining({ name: 'Autosaved study' }),
				),
			{ timeout: 2000 },
		)
		await waitFor(() =>
			expect(
				(
					screen.getByRole('button', {
						name: 'Save draft',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true),
		)
		expect(Modal.success).not.toHaveBeenCalled()
	})
	it('shows a manual save confirmation only after the server responds', async () => {
		let resolveSave!: (value: Experiment) => void
		api.save.mockImplementation(
			() =>
				new Promise<Experiment>((resolve) => {
					resolveSave = resolve
				}),
		)
		openEditor()
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'Manually saved study' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
		expect(Modal.success).not.toHaveBeenCalled()
		resolveSave(structuredClone(api.save.mock.calls[0][0]))
		expect(await screen.findByText('Draft saved.')).toBeTruthy()
		expect(Modal.success).not.toHaveBeenCalled()
	})
	it('does not show a success modal when a manual save fails', async () => {
		api.save.mockRejectedValue(new Error('Save failed'))
		openEditor()
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'Failed save' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
		await screen.findByText('Save failed')
		expect(Modal.success).not.toHaveBeenCalled()
	})
	it('saves the current unsaved content as Live and shows success after the response', async () => {
		openEditor()
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'Updated study' },
		})
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		await screen.findByText(
			/Experiment published\. Experiment code: EXP-PUBLISH/,
		)
		expect(api.save).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Updated study', status: 'Live' }),
		)
		expect(
			(
				screen.getByRole('button', {
					name: 'Published',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
	})
	it('shows validation errors without making a save request', async () => {
		api.experiments[0].stages.pop()
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		expect(
			await screen.findByText('This experiment is not ready to publish'),
		).toBeTruthy()
		expect(api.save).not.toHaveBeenCalled()
	})
	it('preserves the draft and allows retry after a failed publication', async () => {
		api.save.mockRejectedValueOnce(new Error('Publication failed'))
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		await screen.findByText('Publication failed')
		expect(
			screen.getByText('Draft', { selector: '.status-pill' }),
		).toBeTruthy()
		expect(
			(
				screen.getByRole('button', {
					name: 'Publish',
					exact: true,
				}) as HTMLButtonElement
			).disabled,
		).toBe(false)
	})
	it('prevents duplicate requests and preserves edits made during publication', async () => {
		let finish!: (value: Experiment) => void
		api.save.mockImplementationOnce(
			() =>
				new Promise<Experiment>((resolve) => {
					finish = resolve
				}),
		)
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Publishing…' }))
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'Newer edit' },
		})
		finish({ ...api.experiments[0], status: 'Live' })
		await screen.findByText(/Newer edits are still unsaved/)
		expect(api.save).toHaveBeenCalledTimes(1)
		expect(screen.getByDisplayValue('Newer edit')).toBeTruthy()
		await waitFor(() =>
			expect(
				(
					screen.getByRole('button', {
						name: 'Publish',
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		)
	})
})

describe('stage drag handle', () => {
	afterEach(cleanup)
	it('removes movement buttons and preserves accessible handle reordering', async () => {
		const { StageBuilder } = await import('../src/researcher/StageBuilder')
		const study = experiment()
		study.stages.push({
			...createStage('short_answer'),
			name: 'A very long stage name for review',
		})
		const reorder = vi.fn()
		render(
			<StageBuilder
				experiment={study}
				selectedStageId={study.stages[0].id}
				onSelectStage={() => {}}
				onAddStage={() => {}}
				onDeleteStage={() => {}}
				onReorderStages={reorder}
			/>,
		)
		expect(screen.queryByTitle('Move up')).toBeNull()
		expect(screen.queryByTitle('Move down')).toBeNull()
		fireEvent.keyDown(
			screen.getByRole('button', {
				name: 'Reorder A very long stage name for review',
			}),
			{ key: 'ArrowUp', altKey: true },
		)
		expect(reorder).toHaveBeenCalledWith(2, 1)
		expect(
			screen.getByTitle('A very long stage name for review'),
		).toBeDefined()
	})
})

describe('study material deletion', () => {
	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})
	function Materials() {
		const [stage, setStage] = useState(() => ({
			...createStage('short_answer'),
			id: 'material-stage',
			materials: [
				{
					id: 'material',
					name: 'instructions.pdf',
					reference: 'legacy:materials/owner/material',
				},
			],
		}))
		return (
			<StageContentEditor
				experimentId="study"
				stage={stage}
				onUpdateStage={setStage}
			/>
		)
	}
	it('deletes the selected material only after the server succeeds', async () => {
		let resolve!: () => void
		const remove = vi.spyOn(http, 'del').mockImplementationOnce(
			() =>
				new Promise<void>((done) => {
					resolve = done
				}),
		)
		render(<Materials />)
		fireEvent.click(
			screen.getByRole('button', { name: 'Delete instructions.pdf' }),
		)
		expect(remove).toHaveBeenCalledWith(
			'/experiments/study/stages/material-stage/materials/material',
		)
		expect(
			(
				screen.getByRole('button', {
					name: 'Delete instructions.pdf',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
		expect(
			screen.getByRole('button', { name: 'instructions.pdf' }),
		).toBeTruthy()
		resolve()
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'instructions.pdf' }),
			).toBeNull(),
		)
	})
	it('preserves the material on failure and allows retry', async () => {
		const remove = vi
			.spyOn(http, 'del')
			.mockRejectedValueOnce(new Error('Only drafts can be changed'))
			.mockResolvedValueOnce(undefined)
		render(<Materials />)
		fireEvent.click(
			screen.getByRole('button', { name: 'Delete instructions.pdf' }),
		)
		expect(await screen.findByRole('alert')).toHaveProperty(
			'textContent',
			'Only drafts can be changed',
		)
		expect(
			screen.getByRole('button', { name: 'instructions.pdf' }),
		).toBeTruthy()
		fireEvent.click(
			screen.getByRole('button', { name: 'Delete instructions.pdf' }),
		)
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'instructions.pdf' }),
			).toBeNull(),
		)
		expect(remove).toHaveBeenCalledTimes(2)
	})
})

describe('editor unpublishing', () => {
	it('returns a published study to Draft, saves edits and allows publishing again', async () => {
		api.experiments[0].status = 'Live'
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Unpublish', exact: true }),
		)
		await screen.findByText(
			'Experiment unpublished. Participation is paused until you publish again.',
		)
		expect(api.save).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Publish study',
				status: 'Draft',
				publish: false,
			}),
		)
		expect(
			screen.getByText('Draft', { selector: '.status-pill' }),
		).toBeTruthy()
		expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull()
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		await screen.findByText(/Experiment published/)
		expect(
			screen.getByRole('button', { name: 'Unpublish', exact: true }),
		).toBeTruthy()
	})
	it('keeps Live on failure and allows retry', async () => {
		api.experiments[0].status = 'Live'
		api.save.mockRejectedValueOnce(new Error('Unpublish unavailable'))
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Unpublish', exact: true }),
		)
		await screen.findByText('Unpublish unavailable')
		expect(
			screen.getByText('Live', { selector: '.status-pill' }),
		).toBeTruthy()
		fireEvent.click(
			screen.getByRole('button', { name: 'Unpublish', exact: true }),
		)
		await screen.findByText(/Experiment unpublished/)
		expect(api.save).toHaveBeenCalledTimes(2)
	})
	it('disables publish controls while unpublishing', async () => {
		api.experiments[0].status = 'Live'
		let finish!: (value: Experiment) => void
		api.save.mockImplementationOnce(
			() =>
				new Promise<Experiment>((resolve) => {
					finish = resolve
				}),
		)
		openEditor()
		fireEvent.click(
			screen.getByRole('button', { name: 'Unpublish', exact: true }),
		)
		const button = screen.getByRole('button', {
			name: 'Unpublishing…',
		}) as HTMLButtonElement
		expect(button.disabled).toBe(true)
		fireEvent.click(button)
		expect(api.save).toHaveBeenCalledOnce()
		finish({ ...api.experiments[0], status: 'Draft' })
		await screen.findByText(/Experiment unpublished/)
	})
})

describe('editing published experiments', () => {
	it('immediately switches Live to Draft and auto-saves without publishing', async () => {
		api.experiments[0].status = 'Live'
		openEditor()
		fireEvent.change(screen.getByDisplayValue('Publish study'), {
			target: { value: 'New draft title' },
		})
		expect(
			screen.getByText('Draft', { selector: '.status-pill' }),
		).toBeTruthy()
		expect(
			screen.queryByRole('button', { name: 'Unpublish', exact: true }),
		).toBeNull()
		await waitFor(
			() =>
				expect(api.save).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'New draft title',
						status: 'Draft',
					}),
				),
			{ timeout: 2000 },
		)
		expect(api.save.mock.calls[0][0].publish).not.toBe(true)
		fireEvent.click(
			screen.getByRole('button', { name: 'Publish', exact: true }),
		)
		await screen.findByText(/Experiment published/)
		expect(api.save).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: 'Live', publish: true }),
		)
	})
})

it('dismisses save failure feedback without automatically retrying the failed save', async () => {
	api.save.mockRejectedValue(new Error('Temporary save error'))
	openEditor()
	fireEvent.change(screen.getByDisplayValue('Publish study'), {
		target: { value: 'Failed draft' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
	await screen.findByText('Temporary save error')
	await waitFor(
		() => expect(screen.queryByText('Temporary save error')).toBeNull(),
		{ timeout: 3500 },
	)
	expect(api.save).toHaveBeenCalledOnce()
})

it.each(['consent', 'Consent'])(
	'hides study materials for %s authoring',
	(type) => {
		const stage = {
			...createStage('consent'),
			type,
			materials: [
				{
					id: 'old',
					name: 'old-material.pdf',
					reference: 'legacy:materials/owner/old',
				},
			],
		}
		render(
			<StageContentEditor
				experimentId="study"
				stage={stage}
				onUpdateStage={vi.fn()}
			/>,
		)
		expect(screen.queryByText(/Study materials/)).toBeNull()
		expect(
			screen.queryByRole('button', { name: 'old-material.pdf' }),
		).toBeNull()
	},
)

it('excludes Consent from selectable stage types and locks the introductory stage', () => {
	const { rerender } = render(
		<StageContentEditor
			stage={createStage('short_answer')}
			onUpdateStage={vi.fn()}
		/>,
	)
	expect(
		screen.queryByRole('option', { name: 'Consent', exact: true }),
	).toBeNull()
	expect(screen.getByRole('combobox')).toBeTruthy()
	rerender(
		<StageContentEditor
			stage={createStage('consent')}
			onUpdateStage={vi.fn()}
		/>,
	)
	expect(screen.queryByRole('combobox')).toBeNull()
	expect(screen.getByLabelText('Stage name')).toBeTruthy()
})
