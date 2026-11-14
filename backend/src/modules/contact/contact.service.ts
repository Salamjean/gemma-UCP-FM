import { Injectable, Logger } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';

/**
 * Logique des messages de contact.
 * Pour l'instant stockés en mémoire : à remplacer par une base de données
 * ou un envoi d'email.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly messages: (CreateMessageDto & { date: Date })[] = [];

  create(dto: CreateMessageDto) {
    this.messages.push({ ...dto, date: new Date() });
    this.logger.log(`Nouveau message de ${dto.name} <${dto.email}>`);
    return { success: true };
  }
}
