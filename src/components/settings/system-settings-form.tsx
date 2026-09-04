"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateSystemSettingsFormAction, type SettingsFormState } from "@/app/settings/actions";
import type { PublicSystemSettings } from "@/modules/settings/types";

const initialState: SettingsFormState = { ok: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="secondary-button" disabled={pending} type="submit">
      {pending ? "Saving Issuer Settings…" : "Save Issuer Settings"}
    </button>
  );
}

export function SystemSettingsForm({ settings }: { settings: PublicSystemSettings }) {
  const [state, action] = useActionState(updateSystemSettingsFormAction, initialState);

  return (
    <form action={action} className="panel settings-form">
      <label className="field" htmlFor="issuer-name">
        <span>Issuer Name</span>
        <input defaultValue={settings.issuerName} id="issuer-name" name="issuerName" required />
        <small>Shown for newly configured public issuer presentation.</small>
      </label>
      <label className="field" htmlFor="issuer-url">
        <span>Canonical URL</span>
        <input
          defaultValue={settings.issuerUrl}
          id="issuer-url"
          name="issuerUrl"
          required
          type="url"
        />
        <small>Use a complete HTTP or HTTPS URL.</small>
      </label>
      <label className="field" htmlFor="issuer-logo-path">
        <span>Issuer Logo Path</span>
        <input
          defaultValue={settings.issuerLogoPath}
          id="issuer-logo-path"
          name="issuerLogoPath"
          required
        />
        <small>Use a safe root-relative path, such as /images/issuer-logo.png.</small>
      </label>
      <label className="field" htmlFor="support-contact">
        <span>Support Contact</span>
        <input
          defaultValue={settings.supportContact ?? ""}
          id="support-contact"
          name="supportContact"
        />
        <small>Optional email address, mailto: address, or HTTP/HTTPS URL.</small>
      </label>
      <label className="confirmation-control" htmlFor="sharing-enabled">
        <input
          defaultChecked={settings.sharingEnabled}
          id="sharing-enabled"
          name="sharingEnabled"
          type="checkbox"
        />
        <span>Enable Public Sharing</span>
      </label>
      <p aria-live="polite" className="form-message" role="status">
        {state.ok === true ? "Issuer settings saved." : null}
      </p>
      {state.ok === false ? (
        <p aria-live="assertive" className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
