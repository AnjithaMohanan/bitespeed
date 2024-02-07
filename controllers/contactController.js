const Contact = require('../models/Contact');

exports.identify = async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;

        // Find existing contacts with the provided email or phone number
        const existingContacts = await Contact.find({ $or: [{ email }, { phoneNumber }] }).exec();

        if (existingContacts.length === 0) {
            // If no existing contacts found, create a new primary contact
            const newPrimaryContact = new Contact({ email, phoneNumber, linkPrecedence: 'primary' });
            await newPrimaryContact.save();

            // Return the newly created primary contact
            return res.status(200).json({
                contact: {
                    primaryContactId: newPrimaryContact._id,
                    emails: [email],
                    phoneNumbers: [phoneNumber],
                    secondaryContactIds: [] // No secondary contacts yet
                }
            });
        } else if (existingContacts.length === 1) {
            // If only one existing contact found
            const existingContact = existingContacts[0];
            if (existingContact.linkPrecedence === 'primary') {
                // If the existing contact is already a primary contact, return its information
                return res.status(200).json({
                    contact: {
                        primaryContactId: existingContact._id,
                        emails: [existingContact.email],
                        phoneNumbers: [existingContact.phoneNumber],
                        secondaryContactIds: [] // No secondary contacts
                    }
                });
            } else {
                // If the existing contact is a secondary contact, return an error
                return res.status(400).json({ error: 'Existing contact is a secondary contact' });
            }
        } else {
            // If multiple existing contacts found, determine the oldest primary contact
            let oldestPrimaryContact = existingContacts.find(contact => contact.linkPrecedence === 'primary');
            if (!oldestPrimaryContact) {
                // If no primary contact found among existing contacts, select the oldest contact as primary
                oldestPrimaryContact = existingContacts.reduce((oldest, contact) => oldest.createdAt < contact.createdAt ? oldest : contact);
                oldestPrimaryContact.linkPrecedence = 'primary';
                await oldestPrimaryContact.save();
            }

            // Create secondary contacts for other existing contacts
            const secondaryContacts = existingContacts.filter(contact => contact !== oldestPrimaryContact);
            const secondaryContactIds = [];
            for (const secondaryContact of secondaryContacts) {
                const newSecondaryContact = new Contact({ email: secondaryContact.email, phoneNumber: secondaryContact.phoneNumber, linkedId: oldestPrimaryContact._id, linkPrecedence: 'secondary' });
                await newSecondaryContact.save();
                secondaryContactIds.push(newSecondaryContact._id);
            }

            // Return the primary contact with secondary contact information
            return res.status(200).json({
                contact: {
                    primaryContactId: oldestPrimaryContact._id,
                    emails: [oldestPrimaryContact.email, ...secondaryContacts.map(contact => contact.email)],
                    phoneNumbers: [oldestPrimaryContact.phoneNumber, ...secondaryContacts.map(contact => contact.phoneNumber)],
                    secondaryContactIds
                }
            });
        }
    } catch (error) {
        console.error('Error identifying contact:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};