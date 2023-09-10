import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma'

const MsInOneDay = 24 * 60 * 60 * 1000;

interface Booking {
    guestName: string;
    unitID: string;
    checkInDate: Date;
    numberOfNights: number;
}

const getBookingCheckOutDate = (booking: Booking) => {
    const { checkInDate, numberOfNights } = booking;
    const checkIn = new Date(checkInDate);
    return new Date(
        new Date(checkIn)
        .setDate(checkIn.getDate() + numberOfNights)
    )
}

const healthCheck = async (req: Request, res: Response, next: NextFunction) => {
    return res.status(200).json({
        message: "OK"
    })
}

const createBooking = async (req: Request, res: Response, next: NextFunction) => {
    const booking: Booking = req.body;

    let outcome = await isBookingPossible(booking);
    if (!outcome.result) {
        return res.status(400).json(outcome.reason);
    }

    let bookingResult = await prisma.booking.create({
        data: {
             guestName: booking.guestName,
             unitID: booking.unitID,
             checkInDate: new Date(booking.checkInDate),
             numberOfNights: booking.numberOfNights
       }
    })

    return res.status(200).json(bookingResult);
}

type bookingOutcome = {result:boolean, reason:string};

async function isBookingPossible(booking: Booking): Promise<bookingOutcome> {
    // check 1 : The Same guest cannot book the same unit multiple times
    let sameGuestSameUnit = await prisma.booking.findMany({
        where: {
            AND: {
                guestName: {
                    equals: booking.guestName,
                },
                unitID: {
                    equals: booking.unitID,
                },
            },
        },
    });
    if (sameGuestSameUnit.length > 0) {
        return {result: false, reason: "The given guest name cannot book the same unit multiple times"};
    }

    // check 2 : the same guest cannot be in multiple units at the same time
    let sameGuestAlreadyBooked = await prisma.booking.findMany({
        where: {
            guestName: {
                equals: booking.guestName,
            },
        },
    });
    if (sameGuestAlreadyBooked.length > 0) {
        return {result: false, reason: "The same guest cannot be in multiple units at the same time"};
    }

    // check 3 : Unit is available for the range from check-in to check-out dates
    const startDate = new Date(booking.checkInDate).getTime();
    const endDate = getBookingCheckOutDate(booking).getTime();

    const sql = `
    SELECT *
    FROM "Booking" WHERE "unitID" = $1 AND (
            ("checkInDate" BETWEEN $2 AND $3)
            OR 
            ("checkInDate" >= $4 - ("numberOfNights" * $5)
            AND "checkInDate" <= $6 - ("numberOfNights" * $7)
            )
        )
    `;

    let isUnitAvailableOnCheckInDate: Booking[] = await prisma.$queryRawUnsafe(
        sql,
        booking.unitID,
        startDate,
        endDate,
        startDate,
        MsInOneDay,
        endDate,
        MsInOneDay,
    );

    if (isUnitAvailableOnCheckInDate.length > 0) {
        return {result: false, reason: "For the given check-in date, the unit is already occupied"};
    }

    return {result: true, reason: "OK"};
}

export default { healthCheck, createBooking }
