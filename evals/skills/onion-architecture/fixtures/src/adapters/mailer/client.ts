export interface Mail {
  to: string;
  subject: string;
  body: string;
}

export class MailerClient {
  constructor(private readonly apiKey: string) {}

  async send(mail: Mail): Promise<{ id: string }> {
    const res = await fetch('https://api.mailer.example/v1/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(mail),
    });
    if (!res.ok) throw new Error(`mailer ${res.status}`);
    return (await res.json()) as { id: string };
  }
}
