import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from '../services/database.js';
import { 
    validateClassCreation, 
    validateClassUpdate, 
    createClassDocument, 
    sanitizeClassForResponse,
    searchClasses,
    getClassesBySubject,
    getClassesByGrade,
    calculateClassStats,
    getSubjectDisplayName,
    getGradeDisplayName,
    addStudentToClass,
    removeStudentFromClass
} from '../models/class.js';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Get all classes for a teacher
router.get('/', verifyToken, async (req, res) => {
    try {
        const { search, subject, gradeLevel, page = 1, limit = 50 } = req.query;
        
        const db = await getDb();
        const classes = db.collection('classes');
        
        let filter = { 
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        };

        // Apply subject filter if provided
        if (subject) {
            filter.subject = subject;
        }

        // Apply grade level filter if provided
        if (gradeLevel) {
            filter.gradeLevel = gradeLevel;
        }

        const options = {
            sort: { name: 1 },
            skip: (page - 1) * parseInt(limit),
            limit: parseInt(limit)
        };

        let [results, total] = await Promise.all([
            classes.find(filter, options).toArray(),
            classes.countDocuments(filter)
        ]);

        // Apply search filter client-side for more flexible searching
        if (search) {
            results = searchClasses(results, search);
            total = results.length;
        }

        // Populate student information
        if (results.length > 0) {
            const students = db.collection('students');
            const studentIds = [...new Set(results.flatMap(c => c.students || []))];
            
            if (studentIds.length > 0) {
                const studentData = await students.find({
                    _id: { $in: studentIds },
                    isActive: true
                }).toArray();
                
                const studentMap = new Map(studentData.map(s => [s._id.toString(), s]));
                
                results = results.map(classDoc => ({
                    ...sanitizeClassForResponse(classDoc),
                    studentDetails: (classDoc.students || []).map(studentId => 
                        studentMap.get(studentId.toString())
                    ).filter(Boolean),
                    studentCount: (classDoc.students || []).length,
                    subjectDisplayName: getSubjectDisplayName(classDoc.subject),
                    gradeDisplayName: getGradeDisplayName(classDoc.gradeLevel)
                }));
            }
        }

        res.json({
            classes: results,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get classes error:', error);
        res.status(500).json({ error: 'Failed to get classes' });
    }
});

// Get class by ID
router.get('/:classId', verifyToken, async (req, res) => {
    try {
        const { classId } = req.params;
        
        const db = await getDb();
        const classes = db.collection('classes');
        
        const classDoc = await classes.findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Populate student information
        if (classDoc.students && classDoc.students.length > 0) {
            const students = db.collection('students');
            const studentData = await students.find({
                _id: { $in: classDoc.students },
                isActive: true
            }).toArray();
            
            classDoc.studentDetails = studentData;
        }

        res.json({
            class: {
                ...sanitizeClassForResponse(classDoc),
                subjectDisplayName: getSubjectDisplayName(classDoc.subject),
                gradeDisplayName: getGradeDisplayName(classDoc.gradeLevel)
            }
        });

    } catch (error) {
        console.error('Get class error:', error);
        res.status(500).json({ error: 'Failed to get class' });
    }
});

// Create new class
router.post('/', verifyToken, async (req, res) => {
    try {
        const classData = req.body;
        
        // Validate input
        const validationErrors = validateClassCreation(classData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        const db = await getDb();
        const classes = db.collection('classes');
        
        // Check for duplicate class name within teacher's classes
        const existingClass = await classes.findOne({
            teacherId: new ObjectId(req.user.userId),
            name: { $regex: new RegExp(`^${classData.name.trim()}$`, 'i') },
            isActive: true
        });

        if (existingClass) {
            return res.status(409).json({ 
                error: 'A class with this name already exists' 
            });
        }

        // Create class document
        const newClass = createClassDocument(new ObjectId(req.user.userId), classData);
        
        const result = await classes.insertOne(newClass);
        newClass._id = result.insertedId;

        // If students are specified, add class to those students
        if (classData.students && classData.students.length > 0) {
            const students = db.collection('students');
            const studentIds = classData.students.map(id => new ObjectId(id));
            
            await students.updateMany(
                { 
                    _id: { $in: studentIds },
                    teacherId: new ObjectId(req.user.userId)
                },
                { 
                    $addToSet: { classes: result.insertedId },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        res.status(201).json({
            message: 'Class created successfully',
            class: {
                ...sanitizeClassForResponse(newClass),
                subjectDisplayName: getSubjectDisplayName(newClass.subject),
                gradeDisplayName: getGradeDisplayName(newClass.gradeLevel)
            }
        });

    } catch (error) {
        console.error('Create class error:', error);
        res.status(500).json({ error: 'Failed to create class' });
    }
});

// Update class
router.put('/:classId', verifyToken, async (req, res) => {
    try {
        const { classId } = req.params;
        const updateData = req.body;
        
        // Validate input
        const validationErrors = validateClassUpdate(updateData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        const db = await getDb();
        const classes = db.collection('classes');
        
        // Check if class exists and belongs to teacher
        const existingClass = await classes.findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!existingClass) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Prepare update data
        const updateFields = {
            updatedAt: new Date()
        };

        if (updateData.name) updateFields.name = updateData.name.trim();
        if (updateData.subject) updateFields.subject = updateData.subject;
        if (updateData.gradeLevel) updateFields.gradeLevel = updateData.gradeLevel;
        if (updateData.description !== undefined) updateFields.description = updateData.description.trim();
        if (updateData.schoolYear) updateFields.schoolYear = updateData.schoolYear;
        if (updateData.semester) updateFields.semester = updateData.semester;
        if (updateData.schedule) updateFields.schedule = updateData.schedule;
        if (updateData.settings) updateFields.settings = { ...existingClass.settings, ...updateData.settings };
        if (updateData.isActive !== undefined) updateFields.isActive = updateData.isActive;

        // Handle student updates separately if provided
        if (updateData.students) {
            const students = db.collection('students');
            const newStudentIds = updateData.students.map(id => new ObjectId(id));
            const oldStudentIds = existingClass.students || [];

            // Remove class from old students
            if (oldStudentIds.length > 0) {
                await students.updateMany(
                    { _id: { $in: oldStudentIds } },
                    { 
                        $pull: { classes: new ObjectId(classId) },
                        $set: { updatedAt: new Date() }
                    }
                );
            }

            // Add class to new students
            if (newStudentIds.length > 0) {
                await students.updateMany(
                    { 
                        _id: { $in: newStudentIds },
                        teacherId: new ObjectId(req.user.userId)
                    },
                    { 
                        $addToSet: { classes: new ObjectId(classId) },
                        $set: { updatedAt: new Date() }
                    }
                );
            }

            updateFields.students = newStudentIds;
        }

        // Update class
        await classes.updateOne(
            { _id: new ObjectId(classId) },
            { $set: updateFields }
        );

        // Get updated class
        const updatedClass = await classes.findOne({
            _id: new ObjectId(classId)
        });

        res.json({
            message: 'Class updated successfully',
            class: {
                ...sanitizeClassForResponse(updatedClass),
                subjectDisplayName: getSubjectDisplayName(updatedClass.subject),
                gradeDisplayName: getGradeDisplayName(updatedClass.gradeLevel)
            }
        });

    } catch (error) {
        console.error('Update class error:', error);
        res.status(500).json({ error: 'Failed to update class' });
    }
});

// Delete class (soft delete)
router.delete('/:classId', verifyToken, async (req, res) => {
    try {
        const { classId } = req.params;
        
        const db = await getDb();
        const classes = db.collection('classes');
        
        // Check if class exists and belongs to teacher
        const classDoc = await classes.findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Soft delete - set isActive to false
        await classes.updateOne(
            { _id: new ObjectId(classId) },
            { 
                $set: { 
                    isActive: false,
                    updatedAt: new Date()
                }
            }
        );

        // Remove class from all students
        if (classDoc.students && classDoc.students.length > 0) {
            const students = db.collection('students');
            await students.updateMany(
                { _id: { $in: classDoc.students } },
                { 
                    $pull: { classes: new ObjectId(classId) },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        res.json({ message: 'Class deleted successfully' });

    } catch (error) {
        console.error('Delete class error:', error);
        res.status(500).json({ error: 'Failed to delete class' });
    }
});

// Add student to class
router.post('/:classId/students/:studentId', verifyToken, async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        
        const db = await getDb();
        const classes = db.collection('classes');
        const students = db.collection('students');
        
        // Verify class belongs to teacher
        const classDoc = await classes.findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Verify student belongs to teacher
        const student = await students.findOne({
            _id: new ObjectId(studentId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Add student to class
        await classes.updateOne(
            { _id: new ObjectId(classId) },
            { 
                $addToSet: { students: new ObjectId(studentId) },
                $set: { updatedAt: new Date() }
            }
        );

        // Add class to student
        await students.updateOne(
            { _id: new ObjectId(studentId) },
            { 
                $addToSet: { classes: new ObjectId(classId) },
                $set: { updatedAt: new Date() }
            }
        );

        res.json({ message: 'Student added to class successfully' });

    } catch (error) {
        console.error('Add student to class error:', error);
        res.status(500).json({ error: 'Failed to add student to class' });
    }
});

// Remove student from class
router.delete('/:classId/students/:studentId', verifyToken, async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        
        const db = await getDb();
        const classes = db.collection('classes');
        const students = db.collection('students');
        
        // Verify class belongs to teacher
        const classDoc = await classes.findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Remove student from class
        await classes.updateOne(
            { _id: new ObjectId(classId) },
            { 
                $pull: { students: new ObjectId(studentId) },
                $set: { updatedAt: new Date() }
            }
        );

        // Remove class from student
        await students.updateOne(
            { _id: new ObjectId(studentId) },
            { 
                $pull: { classes: new ObjectId(classId) },
                $set: { updatedAt: new Date() }
            }
        );

        res.json({ message: 'Student removed from class successfully' });

    } catch (error) {
        console.error('Remove student from class error:', error);
        res.status(500).json({ error: 'Failed to remove student from class' });
    }
});

// Get class statistics
router.get('/stats/overview', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const classes = db.collection('classes');
        
        const classList = await classes.find({
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        }).toArray();

        const stats = calculateClassStats(classList);
        
        res.json({ stats });

    } catch (error) {
        console.error('Get class stats error:', error);
        res.status(500).json({ error: 'Failed to get class statistics' });
    }
});

// Search classes for dropdown
router.get('/search/dropdown', verifyToken, async (req, res) => {
    try {
        const { q, subject, gradeLevel, limit = 20 } = req.query;
        
        const db = await getDb();
        const classes = db.collection('classes');
        
        let filter = { 
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        };

        if (subject) {
            filter.subject = subject;
        }

        if (gradeLevel) {
            filter.gradeLevel = gradeLevel;
        }

        let results = await classes.find(filter, {
            sort: { name: 1 },
            limit: parseInt(limit)
        }).toArray();

        // Apply search filter
        if (q) {
            results = searchClasses(results, q);
        }

        // Format for dropdown
        const dropdownOptions = results.map(classDoc => ({
            value: classDoc._id.toString(),
            label: classDoc.name,
            subject: classDoc.subject,
            subjectDisplayName: getSubjectDisplayName(classDoc.subject),
            gradeLevel: classDoc.gradeLevel,
            gradeDisplayName: getGradeDisplayName(classDoc.gradeLevel),
            studentCount: (classDoc.students || []).length
        }));

        res.json({
            options: dropdownOptions,
            hasMore: results.length === parseInt(limit)
        });

    } catch (error) {
        console.error('Search classes error:', error);
        res.status(500).json({ error: 'Failed to search classes' });
    }
});

export default router;