import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: SESClient;
  private readonly fromEmail: string;

  constructor(config: ConfigService) {
    const aws = config.getOrThrow<{
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      sesFromEmail: string;
    }>('app.aws');

    this.fromEmail = aws.sesFromEmail;
    this.client = new SESClient({
      region: aws.region,
      credentials:
        aws.accessKeyId && aws.secretAccessKey
          ? {
              accessKeyId: aws.accessKeyId,
              secretAccessKey: aws.secretAccessKey,
            }
          : undefined,
    });
  }

  async sendWelcome(to: string, displayName: string): Promise<void> {
    await this.send(
      to,
      'Welcome to Corkboard',
      `Hi ${displayName},\n\nWelcome to Corkboard — your personal knowledge base for recommendations and experiences.`,
    );
  }

  async sendItemShared(
    to: string,
    ownerName: string,
    itemName: string,
  ): Promise<void> {
    await this.send(
      to,
      `${ownerName} shared a recommendation with you`,
      `${ownerName} shared "${itemName}" with you on Corkboard.`,
    );
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.client.send(
        new SendEmailCommand({
          Source: this.fromEmail,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject },
            Body: { Text: { Data: body } },
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        `SES email skipped or failed for ${to}: ${String(error)}`,
      );
    }
  }
}
