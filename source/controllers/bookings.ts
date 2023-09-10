import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma'

const MsInOneDay = 24 * 60 * 60 * 1000;

interface Booking {
    guestName: string;
    unitID: string;
    checkInDate: Date;
    numberOfNights: number;
}

interface ExtendStay {
    bookingID: number;
    addNights: number;
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

const extendStays = async (req: Request, res: Response, next: NextFunction) => {
    const extendStay: ExtendStay = req.body;

    const booking = await getBookingById(extendStay.bookingID);

    if (!booking) {
        return res.status(400).json('Impossible to extend Stay, wrong booking ID');
    }

    const bookingCheckOut = getBookingCheckOutDate(booking);

    /**
     * we need to check if date range
     * from checkInDate + 1 day
     * to checkInDate + numberOfNights + addNights
     * is not booken by other guests
     */
    const checkIfUnitIsNotFree = await checkIfUnitBookenOnGivenDates(
        new Date(new Date(bookingCheckOut).getTime() + 1 * MsInOneDay),
        new Date(new Date(bookingCheckOut).getTime() + extendStay.addNights * MsInOneDay),
        booking.unitID,
    );

    if(checkIfUnitIsNotFree) {
        return res.status(400).json('Unit is booken on given dates');
    }

    let extendStayResult = await prisma.booking.update({
        where: {
            id: extendStay.bookingID
        },
        data: {
             numberOfNights: booking.numberOfNights + extendStay.addNights,
       }
    })

    return res.status(200).json(extendStayResult);
}

const getBookingById = async (bookingId: number) => {
    return prisma.booking.findFirst({
        where: {
            id: bookingId,
        }
    })
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
    const isUnitAvailableOnCheckInDate = await checkIfUnitBookenOnGivenDates(
        new Date(booking.checkInDate),
        getBookingCheckOutDate(booking),
        booking.unitID,
        );

    if (isUnitAvailableOnCheckInDate) {
        return {result: false, reason: "For the given check-in date, the unit is already occupied"};
    }

    return {result: true, reason: "OK"};
}

async function checkIfUnitBookenOnGivenDates(checkIn: Date, checkOut: Date, unitID: string): Promise<Boolean> {
    console.log(
        checkIn,
        checkOut,
        unitID,
        '==='
    )
    const startDate = checkIn.getTime();
    const endDate = checkOut.getTime();

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

    const isUnitBooked: Booking[] = await prisma.$queryRawUnsafe(
        sql,
        unitID,
        startDate,
        endDate,
        startDate,
        MsInOneDay,
        endDate,
        MsInOneDay,
    );
    return Boolean(isUnitBooked.length > 0)
}

export default { healthCheck, createBooking, extendStays }
