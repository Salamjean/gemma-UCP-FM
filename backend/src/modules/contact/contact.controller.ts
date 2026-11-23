import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { CreateMessageDto } from './dto/create-message.dto';

/** Routes : POST /api/contact */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Formulaire public : 5 messages / minute / IP au plus (anti spam)
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateMessageDto) {
    return this.contactService.create(dto);
  }
}
