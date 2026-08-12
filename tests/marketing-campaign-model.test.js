import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { campaignAdditionalBlocks, campaignContentBlocks, campaignStatusLabel, campaignToDraft, canLaunchCampaignDraft, isCampaignEditable } from "../src/features/marketing/marketingCampaignModel.js";

describe("marketing campaign modal model", () => {
  it("hydrates an existing campaign into editable form values", () => {
    const draft = campaignToDraft({
      id: "campaign_1",
      audienceId: "audience_1",
      channels: ["telegram"],
      content: { blocks: [{ type: "text", text: "Новость" }, { type: "heading", text: "Важно" }] },
      scheduledAt: "2026-08-12T09:30:00.000Z",
      strategy: "cascade",
      title: "Август"
    });
    assert.equal(draft.title, "Август");
    assert.equal(draft.contentText, "Новость");
    assert.equal(draft.audienceId, "audience_1");
    assert.match(draft.scheduledAt, /^2026-08-12T\d{2}:30$/);
    assert.deepEqual(campaignAdditionalBlocks({ content: { blocks: [{ type: "text", text: "Новость" }, { type: "heading", text: "Важно" }] } }), [{ id: "campaign_block_0", type: "heading", text: "Важно" }]);
  });

  it("locks launched campaigns and keeps drafts and scheduled campaigns editable", () => {
    assert.equal(isCampaignEditable("draft"), true);
    assert.equal(isCampaignEditable("scheduled"), true);
    assert.equal(isCampaignEditable("sending"), false);
    assert.equal(isCampaignEditable("completed"), false);
    assert.equal(campaignStatusLabel("sending"), "Активна");
  });

  it("requires content, a channel, and recipients before launch", () => {
    const complete = { audienceId: "audience_1", channels: ["telegram"], clientIds: "", contentText: "Текст", title: "Кампания" };
    assert.equal(canLaunchCampaignDraft(complete), true);
    assert.equal(canLaunchCampaignDraft({ ...complete, audienceId: "" }), false);
    assert.equal(canLaunchCampaignDraft({ ...complete, channels: [] }), false);
    assert.equal(canLaunchCampaignDraft({ ...complete, audienceId: "", clientIds: "client_1" }), true);
  });

  it("places headings before message text and attachments", () => {
    const image = { fileId: "file-1", fileName: "offer.png", type: "image" };
    const heading = { id: "heading-1", text: "Важно", type: "heading" };
    assert.deepEqual(campaignContentBlocks("Основной текст", [image, heading]), [heading, { type: "text", text: "Основной текст" }, image]);
  });
});
