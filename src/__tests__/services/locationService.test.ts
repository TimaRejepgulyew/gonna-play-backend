import { LocationService } from '../../services/locationService';

describe('LocationService', () => {
  let locationService: LocationService;
  let mockPg: any;

  beforeEach(() => {
    // Mock PostgresDb
    mockPg = {
      query: jest.fn(),
    };
    locationService = new LocationService(mockPg);
  });

  describe('createLocation', () => {
    it('should create a location successfully', async () => {
      // Arrange
      const mockLocation = {
        id: 1,
        name: 'Test Location',
        address: '123 Test St',
        city: 'Test City',
        created_at: new Date(),
      };

      mockPg.query.mockResolvedValueOnce({
        rows: [mockLocation],
      });

      // Act
      const result = await locationService.createLocation({
        name: 'Test Location',
        address: '123 Test St',
        city: 'Test City',
      });

      // Assert
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO locations'),
        expect.arrayContaining(['Test Location', '123 Test St', 'Test City'])
      );
      expect(result).toEqual(mockLocation);
    });
  });

  describe('findLocationById', () => {
    it('should return a location when found', async () => {
      // Arrange
      const mockLocation = {
        id: 1,
        name: 'Test Location',
        address: '123 Test St',
        city: 'Test City',
        created_at: new Date(),
      };

      mockPg.query.mockResolvedValueOnce({
        rows: [mockLocation],
      });

      // Act
      const result = await locationService.findLocationById(1);

      // Assert
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM locations WHERE id = $1'),
        [1]
      );
      expect(result).toEqual(mockLocation);
    });

    it('should return null when location not found', async () => {
      // Arrange
      mockPg.query.mockResolvedValueOnce({
        rows: [],
      });

      // Act
      const result = await locationService.findLocationById(999);

      // Assert
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM locations WHERE id = $1'),
        [999]
      );
      expect(result).toBeNull();
    });
  });

  // Add more tests for other methods as needed
});
