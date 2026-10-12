/**
 * client.ts — the single WorkBuddy Cloud client for this application.
 *
 * Initialized once and shared by every module that talks to the cloud. All
 * modules reuse this instance; never create a second client.
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloudPublicConfig } from './config'

export const cloud = createWorkBuddyCloud({
  endpoint: cloudPublicConfig.endpoint,
  publishableKey: cloudPublicConfig.publishableKey,
})
